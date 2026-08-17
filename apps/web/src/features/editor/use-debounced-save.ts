/** @fileoverview 聚合标题与正文变更并按统一乐观版本防抖保存的状态机。 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { DOCUMENT_SCHEMA_VERSION } from '@everlearn/contracts';

import { saveDocumentContent } from './editor-api';

/** 防抖窗口毫秒数，窗口内多次输入聚合为一次提交。 */
export const SAVE_DEBOUNCE_MS = 800;

/** 编辑器保存状态机的全部稳定状态。 */
export type DocumentSaveStatus = 'idle' | 'saving' | 'saved' | 'conflict' | 'failed';

/** 一次待保存的本地内容快照，标题可选以支持仅正文变更。 */
export interface StagedDocumentContent {
  readonly contentJson: unknown;
  readonly title?: string;
}

/** useDebouncedSave 的配置契约。 */
export interface DebouncedSaveOptions {
  readonly documentId: string;
  readonly initialVersion: number;
}

/** 暴露给编辑器宿主的保存控制器。 */
export interface DebouncedSaveController {
  readonly copyLocalContent: () => string;
  /** 用于丢弃本地快照并取消待发提交，会话被显式替换时调用。 */
  readonly discard: () => void;
  readonly getVersion: () => number;
  readonly retry: () => void;
  readonly stage: (content: StagedDocumentContent) => void;
  readonly status: DocumentSaveStatus;
}

/** 保存过程的可变引用状态，跨渲染保持单例。 */
interface SaveState {
  /** 会话被显式替换后失能，卸载阶段的末次编辑器事务不再触发提交。 */
  discarded: boolean;
  inFlight: boolean;
  local: StagedDocumentContent | undefined;
  status: DocumentSaveStatus;
  version: number;
}

/** 一次提交执行所需的状态引用与稳定回调。 */
interface SaveRuntime {
  readonly applyStatus: (next: DocumentSaveStatus) => void;
  readonly documentId: string;
  readonly flush: { current: () => Promise<void> };
  readonly state: { current: SaveState };
  readonly timer: { current: ReturnType<typeof setTimeout> | undefined };
}

/** 用于宽容遍历编辑器产出的正文 JSON 并折叠为可复制纯文本。 */
function textFromNode(node: unknown): string {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) {
    return '';
  }
  const record = node as Record<string, unknown>;
  if (record.type === 'text') {
    return typeof record.text === 'string' ? record.text : '';
  }
  if (record.type === 'hardBreak') {
    return '\n';
  }
  if (!Array.isArray(record.content)) {
    return '';
  }
  const parts = record.content.map(textFromNode);
  return record.type === 'doc' ? parts.join('\n\n') : parts.join('');
}

/** 用于按标题加正文组装本地内容的可复制文本。 */
function localContentText(snapshot: StagedDocumentContent): string {
  const body = textFromNode(snapshot.contentJson);
  return snapshot.title === undefined ? body : `${snapshot.title}\n\n${body}`;
}

/** 用于重置防抖定时器并延迟触发一次提交。 */
function scheduleSave(timer: SaveRuntime['timer'], flush: SaveRuntime['flush']): void {
  clearTimeout(timer.current);
  timer.current = setTimeout(() => {
    void flush.current();
  }, SAVE_DEBOUNCE_MS);
}

/** 用于卸载时清理定时器并发起一次不等待的保存。 */
function flushOnUnmount(timer: SaveRuntime['timer'], flush: () => Promise<void>): void {
  clearTimeout(timer.current);
  // ponytail: 浏览器直接关闭可能终止请求，仅丢失最近防抖窗口的内容。
  void flush();
}

/** 用于执行一次提交并按结果推进基线或进入冲突、失败态。 */
async function runSaveFlush(runtime: SaveRuntime): Promise<void> {
  const state = runtime.state.current;
  const snapshot = state.local;
  if (snapshot === undefined || state.inFlight || state.status === 'conflict') {
    return;
  }
  state.inFlight = true;
  runtime.applyStatus('saving');
  const result = await saveDocumentContent(runtime.documentId, {
    contentJson: snapshot.contentJson,
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    ...(snapshot.title === undefined ? {} : { title: snapshot.title }),
    version: state.version,
  });
  state.inFlight = false;
  if (state.discarded) return;
  if (result.ok) {
    state.version = result.data.version;
    runtime.applyStatus('saved');
    if (state.local !== snapshot) {
      scheduleSave(runtime.timer, runtime.flush);
    }
    return;
  }
  runtime.applyStatus(result.error.code === 'VERSION_CONFLICT' ? 'conflict' : 'failed');
}

/** 用于维护保存状态镜像、可变引用与提交入口。 */
function useSaveFlush(documentId: string, initialVersion: number) {
  const [status, setStatus] = useState<DocumentSaveStatus>('idle');
  const stateRef = useRef<SaveState>({
    discarded: false,
    inFlight: false,
    local: undefined,
    status: 'idle',
    version: initialVersion,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flushRef = useRef<() => Promise<void>>((): Promise<void> => Promise.resolve());

  /** 用于同步响应式状态与过程判断共用的状态镜像。 */
  const applyStatus = useCallback((next: DocumentSaveStatus) => {
    stateRef.current.status = next;
    setStatus(next);
  }, []);

  /** 用于以当前引用组装一次提交执行。 */
  const flush = useCallback(
    () =>
      runSaveFlush({ applyStatus, documentId, flush: flushRef, state: stateRef, timer: timerRef }),
    [applyStatus, documentId],
  );

  useEffect(() => {
    flushRef.current = flush;
    return () => flushOnUnmount(timerRef, flush);
  }, [flush]);

  return { flushRef, stateRef, status, timerRef };
}

/** 用于聚合输入并在成功推进版本基线、冲突时停止后续覆盖提交。 */
export function useDebouncedSave(options: DebouncedSaveOptions): DebouncedSaveController {
  const { documentId, initialVersion } = options;
  const { flushRef, stateRef, status, timerRef } = useSaveFlush(documentId, initialVersion);

  /** 用于聚合一次本地变更；冲突后仅更新快照供复制，不再提交覆盖。 */
  const stage = useCallback(
    (content: StagedDocumentContent) => {
      if (stateRef.current.discarded) return;
      stateRef.current.local = content;
      if (stateRef.current.status !== 'conflict' && !stateRef.current.inFlight) {
        scheduleSave(timerRef, flushRef);
      }
    },
    [flushRef, stateRef, timerRef],
  );

  return {
    /** 用于导出本地未落库内容为纯文本，冲突或失败时供用户复制。 */
    copyLocalContent: () => {
      const snapshot = stateRef.current.local;
      return snapshot === undefined ? '' : localContentText(snapshot);
    },
    /** 用于丢弃本地快照并取消待发提交，让卸载 flush 不再提交旧内容。 */
    discard: () => {
      stateRef.current.local = undefined;
      stateRef.current.discarded = true;
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    },
    /** 用于读取当前已确认的乐观版本基线，供修订恢复等外部写入使用。 */
    getVersion: () => stateRef.current.version,
    /** 用于失败后手动重提当前本地快照。 */
    retry: () => {
      if (stateRef.current.status === 'failed') {
        void flushRef.current();
      }
    },
    stage,
    status,
  };
}
