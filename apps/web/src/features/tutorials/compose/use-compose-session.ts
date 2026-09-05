/**
 * @fileoverview 管理 compose 会话快照的读取、轮询、消息发送与确认卡决议。
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  acceptGenerationDiff,
  confirmTutorialOutline,
  confirmTutorialScope,
  decideProposal,
  getComposeSnapshot,
  sendComposeMessage,
} from '../tutorials-api';
import type { ComposeCard, ComposeSnapshot } from '../tutorials-contract';
import { isPollingStatus } from '../tutorials-status';

const POLL_INTERVAL_MS = 5000;

/** 会话读取失败的稳定投影。 */
export interface ComposeLoadFailure {
  readonly code?: string;
  readonly message: string;
}

/** 确认卡决议动作的判别输入。 */
export type CardDecision = 'accept' | 'reject';

/** 用于把一次快照读取结果安全写入状态并返回失败信息。 */
function applySnapshot(
  result: Awaited<ReturnType<typeof getComposeSnapshot>>,
  setSnapshot: (snapshot: ComposeSnapshot | undefined) => void,
  setLoadError: (failure: ComposeLoadFailure | undefined) => void,
): ComposeLoadFailure | undefined {
  if (result.ok) {
    setSnapshot(result.data);
    setLoadError(undefined);
    return undefined;
  }
  const failure: ComposeLoadFailure = {
    ...(result.error.code ? { code: result.error.code } : {}),
    message: result.error.message,
  };
  setLoadError(failure);
  return failure;
}

/** 用于首读快照并按固定间隔轮询，卸载时停止。 */
function useSessionSynchronization(
  tutorialId: string,
  setSnapshot: (snapshot: ComposeSnapshot | undefined) => void,
  setLoadError: (failure: ComposeLoadFailure | undefined) => void,
): void {
  useEffect(
    /** 用于订阅会话快照并在卸载时停止轮询。 */
    function synchronizeSession(): () => void {
      void getComposeSnapshot(tutorialId).then(
        /** 用于把首读结果写入状态。 */
        (result) => void applySnapshot(result, setSnapshot, setLoadError),
      );
      const timer = setInterval(() => {
        void getComposeSnapshot(tutorialId).then(
          /** 用于把轮询结果写入状态。 */
          (result) => void applySnapshot(result, setSnapshot, setLoadError),
        );
      }, POLL_INTERVAL_MS);
      // ponytail: 轮询无条件 5 秒一次（含空闲态），换 SSE 订阅时按运行态启停可省空闲请求。
      return function cancel(): void {
        clearInterval(timer);
      };
    },
    [tutorialId, setSnapshot, setLoadError],
  );
}

/** 用于持有 compose 会话状态并提供发送与决议入口。 */
export function useComposeSession(tutorialId: string) {
  const [snapshot, setSnapshot] = useState<ComposeSnapshot | undefined>(undefined);
  const [loadError, setLoadError] = useState<ComposeLoadFailure | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const active =
    snapshot !== undefined && (isPollingStatus(snapshot.status) || snapshot.stage !== null);

  /** 用于重读会话快照并返回失败信息。 */
  const load = useCallback(async (): Promise<ComposeLoadFailure | undefined> => {
    const result = await getComposeSnapshot(tutorialId);
    return applySnapshot(result, setSnapshot, setLoadError);
  }, [tutorialId]);

  useSessionSynchronization(tutorialId, setSnapshot, setLoadError);

  /** 用于以幂等键发送用户消息，失败时返回文案供输入区保留重试。 */
  const send = useCallback(
    async (content: string, idempotencyKey: string): Promise<string | undefined> => {
      setSending(true);
      const result = await sendComposeMessage(tutorialId, content, idempotencyKey);
      setSending(false);
      if (!result.ok) return result.error.message;
      await load();
      return undefined;
    },
    [tutorialId, load],
  );

  /** 用于决议确认卡并刷新快照，重复决议由服务端返回首次结果。 */
  const decide = useCallback(
    async (card: ComposeCard, decision: CardDecision): Promise<string | undefined> => {
      const result = await decideCard(tutorialId, card, decision);
      if (!result.ok) return result.error.message;
      await load();
      return undefined;
    },
    [tutorialId, load],
  );

  return { active, decide, load, loadError, send, sending, snapshot };
}

/** 用于决议研究或建库闸门，闸门只有接受动作。 */
function decideGate(
  tutorialId: string,
  card: ComposeCard,
): ReturnType<typeof confirmTutorialScope> {
  if (card.gate === 'scope') return confirmTutorialScope(tutorialId);
  if (card.gate === 'outline') return confirmTutorialOutline(tutorialId);
  return Promise.resolve({
    error: { certainty: 'known', message: '闸门缺少类型，无法确认。' },
    ok: false,
  });
}

/** 用于决议章节改写差异，接受走 Generations 契约，拒绝走提案端点。 */
function decideDiff(
  tutorialId: string,
  card: ComposeCard,
  decision: CardDecision,
): ReturnType<typeof confirmTutorialScope> {
  if (decision === 'accept' && card.diff) return acceptGenerationDiff(card.diff.generationId);
  if (card.proposalId) return decideProposal(tutorialId, card.proposalId, 'reject');
  return Promise.resolve({
    error: { certainty: 'known', message: '差异卡缺少提案标识。' },
    ok: false,
  });
}

/** 用于把确认卡映射到对应的决议端点。 */
function decideCard(
  tutorialId: string,
  card: ComposeCard,
  decision: CardDecision,
): ReturnType<typeof confirmTutorialScope> {
  if (card.variant === 'gate') {
    return decision === 'accept'
      ? decideGate(tutorialId, card)
      : Promise.resolve({
          error: { certainty: 'known', message: '闸门确认不支持拒绝。' },
          ok: false,
        });
  }
  if (card.variant === 'diff') return decideDiff(tutorialId, card, decision);
  if (card.proposalId) return decideProposal(tutorialId, card.proposalId, decision);
  return Promise.resolve({
    error: { certainty: 'known', message: '提案缺少标识，无法决议。' },
    ok: false,
  });
}

/** 用于生成幂等键，重试沿用同一键保证服务端幂等。 */
export function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
