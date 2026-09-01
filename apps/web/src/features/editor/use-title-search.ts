/** @fileoverview 管理弹层内按标题搜索文档的防抖候选与失败状态。 */

'use client';

import { useEffect, useRef, useState } from 'react';

import { searchDocuments } from '../search/search-api';

/** 标题搜索所需的参数。 */
interface UseTitleSearchProps {
  readonly draft: string;
  readonly open: boolean;
}

/** 单条候选结果展示项。 */
export interface TitleCandidate {
  readonly documentId: string;
  readonly title: string;
}

/** 用于按输入草稿检索标题候选并标注搜索失败。 */
export function useTitleSearch(props: UseTitleSearchProps) {
  const [candidates, setCandidates] = useState<readonly TitleCandidate[]>([]);
  const [failed, setFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!props.open) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    void (async () => {
      const query = props.draft.trim();
      const result =
        query.length === 0
          ? undefined
          : await searchDocuments({ field: 'title', limit: 10, query }, controller.signal);
      if (controller.signal.aborted) return;
      setCandidates(
        result?.ok
          ? result.data.items.map((item) => ({
              documentId: item.documentId,
              title: item.documentTitle,
            }))
          : [],
      );
      setFailed(result !== undefined && !result.ok);
    })();
    return () => controller.abort();
  }, [props.draft, props.open]);

  return { candidates, failed };
}
