/** @fileoverview 按修订号加载恢复预览的全文快照数据。 */

'use client';

import { useEffect, useRef, useState } from 'react';

import type { DocumentRevisionDetail } from '@everlearn/contracts';

import { getDocumentRevision, type EditorApiResult } from './editor-api';

/** 修订预览加载状态机的全部稳定状态。 */
export type RevisionPreviewStatus = 'loading' | 'loaded' | 'failed';

/** useRevisionPreview 的配置契约。 */
export interface RevisionPreviewOptions {
  readonly documentId: string;
  readonly revisionNumber: number;
}

/** 暴露给恢复对话框的预览数据控制器。 */
export interface RevisionPreviewController {
  readonly revision: DocumentRevisionDetail | undefined;
  readonly status: RevisionPreviewStatus;
  readonly retry: () => void;
}

/** 预览数据、加载状态与其所属目标的联合快照。 */
interface PreviewState {
  readonly key: string;
  readonly revision: DocumentRevisionDetail | undefined;
  readonly status: RevisionPreviewStatus;
}

const INITIAL_STATE: PreviewState = { key: '', revision: undefined, status: 'loading' };

/** 用于把读取结果收敛为指定目标的预览状态。 */
function toPreviewState(
  key: string,
  result: EditorApiResult<DocumentRevisionDetail>,
): PreviewState {
  if (result.ok) return { key, revision: result.data, status: 'loaded' };
  return { key, revision: undefined, status: 'failed' };
}

/** 用于按修订号加载恢复预览并以请求序号丢弃过期响应。 */
export function useRevisionPreview(options: RevisionPreviewOptions): RevisionPreviewController {
  const { documentId, revisionNumber } = options;
  const key = `${documentId}#${revisionNumber}`;
  const [state, setState] = useState<PreviewState>(INITIAL_STATE);
  const requestRef = useRef(0);

  useEffect(
    /** 用于挂载或目标变化后读取目标修订全文。 */
    function synchronizePreview(): void {
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      void getDocumentRevision(documentId, revisionNumber).then(
        /** 用于在目标变化后忽略过期响应。 */
        function applyIfActive(result): void {
          if (requestRef.current !== requestId) return;
          setState(toPreviewState(key, result));
        },
      );
    },
    [documentId, revisionNumber, key],
  );

  /** 用于失败后重读一次预览并先回到加载态。 */
  async function reload(): Promise<void> {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const result = await getDocumentRevision(documentId, revisionNumber);
    if (requestRef.current === requestId) setState(toPreviewState(key, result));
  }

  const stale = state.key !== key;
  return {
    revision: stale ? undefined : state.revision,
    /** 用于失败后手动重读预览。 */
    retry: () => {
      setState({ key, revision: undefined, status: 'loading' });
      void reload();
    },
    status: stale ? 'loading' : state.status,
  };
}
