/**
 * @fileoverview 提供 compose 会话快照与确认卡的公开投影纯函数。
 */

import type { ComposeCardView, ComposeMessageView, ComposeSnapshotView } from '../conversation.dto';
import type { TutorialDetail, TutorialKnowledgeBaseView } from '../tutorial.dto';
import type { ComposeProposal, ComposeProposalKind } from './compose-agent';

/** 确认卡状态到公开视图状态的收窄映射。 */
function toCardState(status: string | null): ComposeCardView['state'] {
  if (status === 'accepted' || status === 'rejected') return status;
  return 'pending';
}

/** 提案类型的确认卡文案。 */
const PROPOSAL_LABELS: Record<ComposeProposalKind, { body: string; title: string }> = {
  chapter: { body: '接受后把新正文写入该章节文档并追加修订。', title: '章节改写提案' },
  outline: { body: '接受后创建新大纲版本并原子创建教程知识库。', title: '大纲修订提案' },
  scope: { body: '接受后更新研究范围并开始研究运行。', title: '范围调整提案' },
};

/** 用于把携带提案的消息行投影为确认卡，决议端点以消息 id 定位提案。 */
export function toProposalCard(
  proposal: ComposeProposal,
  proposalStatus: string | null,
  messageId: string,
): ComposeCardView {
  const labels = PROPOSAL_LABELS[proposal.kind];
  return {
    body: labels.body,
    gate: proposal.kind === 'scope' || proposal.kind === 'outline' ? proposal.kind : null,
    proposalId: messageId,
    state: toCardState(proposalStatus),
    title: labels.title,
    variant: 'proposal',
  };
}

/** 闸门确认卡文案，按教程状态合成且不落库。 */
const GATE_CARDS = {
  outline: {
    body: '确认后将原子创建教程知识库与章节占位文档，此操作不可逆。',
    title: '确认大纲并建库',
  },
  scope: {
    body: '确认后将固化不可变研究范围并发起研究运行，确认前不调用任何研究工具。',
    title: '确认研究范围',
  },
} as const;

/** 用于按教程状态合成待确认闸门卡；非闸门状态返回 null。 */
export function toGateCard(status: string): ComposeCardView | null {
  if (status !== 'draft_scope' && status !== 'awaiting_outline') return null;
  const gate = status === 'draft_scope' ? 'scope' : 'outline';
  const labels = GATE_CARDS[gate];
  return {
    body: labels.body,
    gate,
    proposalId: null,
    state: 'pending',
    title: labels.title,
    variant: 'gate',
  };
}

/** 对话消息行的最小读取投影。 */
export interface ComposeMessageRow {
  readonly content: string;
  readonly created_at: Date;
  readonly id: string;
  readonly proposal: unknown;
  readonly proposal_status: string | null;
  readonly role: string;
}

/** 用于读取消息行上的合法提案结构。 */
function readProposal(value: unknown): ComposeProposal | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as { kind?: unknown; payload?: unknown };
  const kind = record.kind;
  if (kind !== 'scope' && kind !== 'outline' && kind !== 'chapter') return null;
  if (typeof record.payload !== 'object' || record.payload === null) return null;
  return { kind, payload: record.payload as Record<string, unknown> };
}

/** 用于把消息行投影为 compose 消息视图。 */
export function toComposeMessage(row: ComposeMessageRow): ComposeMessageView {
  const proposal = readProposal(row.proposal);
  return {
    card: proposal === null ? null : toProposalCard(proposal, row.proposal_status, row.id),
    createdAt: row.created_at.toISOString(),
    id: row.id,
    role: row.role === 'user' ? 'user' : 'agent',
    text: row.content,
  };
}

/** 用于把教程详情与消息行组装为 compose 会话快照。 */
export function toComposeSnapshot(input: {
  conversationCreatedAt: string;
  detail: TutorialDetail;
  knowledgeBase: TutorialKnowledgeBaseView | null;
  messages: readonly ComposeMessageRow[];
}): ComposeSnapshotView {
  const messages = input.messages.map(toComposeMessage);
  const gate = toGateCard(input.detail.status);
  if (gate !== null) {
    messages.push({
      card: gate,
      createdAt: input.conversationCreatedAt,
      id: `gate:${input.detail.id}:${gate.gate}`,
      role: 'agent',
      text: '',
    });
  }
  return {
    chapters: input.detail.chapters,
    hasEarlierMessages: false,
    knowledgeBase: input.knowledgeBase,
    messages,
    stage: input.detail.stage,
    status: input.detail.status,
    tutorialId: input.detail.id,
    topic: input.detail.scope.topic,
  };
}
