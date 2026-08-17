/** @fileoverview 在离开文档与持续编辑间隔两个触发点创建不可变修订快照。 */

'use client';

import { useCallback, useEffect, useRef } from 'react';

import { DOCUMENT_SCHEMA_VERSION } from '@everlearn/contracts';

import { createDocumentRevision } from './editor-api';
import type { StagedDocumentContent } from './use-debounced-save';

/** 持续编辑间隔毫秒数，间隔到点且仍有变更时创建新快照。 */
export const REVISION_INTERVAL_MS = 5 * 60_000;

/** useRevisionTriggers 的配置契约。 */
export interface RevisionTriggerOptions {
  readonly documentId: string;
  readonly initialVersion: number;
}

/** 暴露给编辑器宿主的修订触发控制器。 */
export interface RevisionTriggerController {
  stage(content: StagedDocumentContent): void;
}

/** 修订触发的可变引用状态，跨渲染保持单例。 */
interface RevisionTriggerState {
  baseline: StagedDocumentContent | undefined;
  inFlight: boolean;
  local: StagedDocumentContent | undefined;
}

/** 用于提交一次修订且仅在网络失败时保留待重试基线。 */
async function submitRevision(
  documentId: string,
  version: number,
  state: { current: RevisionTriggerState },
): Promise<void> {
  const snapshot = state.current.local;
  if (snapshot === undefined || state.current.inFlight || snapshot === state.current.baseline) {
    return;
  }
  state.current.inFlight = true;
  const result = await createDocumentRevision(documentId, {
    contentJson: snapshot.contentJson,
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    ...(snapshot.title === undefined ? {} : { title: snapshot.title }),
    version,
  });
  state.current.inFlight = false;
  // 服务端已给出确定结论（成功、相邻重复或 4xx）时推进基线，仅网络失败保留下次重试。
  if (result.ok || result.error.certainty === 'known') {
    state.current.baseline = snapshot;
  }
}

/** 用于聚合输入并在离开文档或持续编辑间隔时创建修订。 */
export function useRevisionTriggers(options: RevisionTriggerOptions): RevisionTriggerController {
  const { documentId, initialVersion } = options;
  const stateRef = useRef<RevisionTriggerState>({
    baseline: undefined,
    inFlight: false,
    local: undefined,
  });
  // 观察版本仅用于服务端拒绝超前版本；滞后的初始版本被接受以兼容离开时与保存竞态。
  const versionRef = useRef(initialVersion);

  /** 用于以当前引用组装一次修订提交。 */
  const submit = useCallback(
    () => submitRevision(documentId, versionRef.current, stateRef),
    [documentId, stateRef],
  );
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  useEffect(() => {
    const timer = setInterval(() => {
      void submitRef.current();
    }, REVISION_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      // ponytail: 卸载触发为 fire-and-forget，浏览器直接关闭可能丢失该次修订；重复提交由服务端相邻去重兜底。
      void submitRef.current();
      stateRef.current = { baseline: undefined, inFlight: false, local: undefined };
    };
  }, [documentId, stateRef]);

  /** 用于聚合一次本地变更供触发点读取。 */
  const stage = useCallback(
    (content: StagedDocumentContent) => {
      stateRef.current.local = content;
    },
    [stateRef],
  );

  return { stage };
}
