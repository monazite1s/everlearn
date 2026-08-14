/** @fileoverview 管理知识库列表的初始同步和游标分页。 */

'use client';

import type { KnowledgeBaseListResponse, KnowledgeBaseSummary } from '@everlearn/contracts';
import { useEffect, useState } from 'react';

import { listKnowledgeBases } from './knowledge-api';
import type { KnowledgeApiFailure, KnowledgeApiResult } from './knowledge-api';

export interface KnowledgeLoadState {
  readonly error?: KnowledgeApiFailure;
  readonly loading: boolean;
  readonly nextCursor: string | null;
}

const INITIAL_LOAD: KnowledgeLoadState = { loading: true, nextCursor: null };

/** 用于管理游标读取并在后续分页失败时保留已有结果。 */
export function useKnowledgeList() {
  const [items, setItems] = useState<readonly KnowledgeBaseSummary[]>([]);
  const [load, setLoad] = useState<KnowledgeLoadState>(INITIAL_LOAD);
  /** 用于应用首个响应且不合并过期结果。 */
  function applyInitial(result: KnowledgeApiResult<KnowledgeBaseListResponse>): void {
    if (result.ok) {
      setItems(result.data.items);
      setLoad({ loading: false, nextCursor: result.data.nextCursor });
      return;
    }
    setLoad({ error: result.error, loading: false, nextCursor: null });
  }
  useEffect(
    /** 用于启动并取消初始列表同步。 */
    function synchronizeInitialList(): () => void {
      let active = true;
      void listKnowledgeBases().then(
        /** 用于在路由释放后忽略过期响应。 */
        function applyIfActive(result): void {
          if (active) applyInitial(result);
        },
      );
      return /** Marks later request completion as stale. */ function cancel(): void {
        active = false;
      };
    },
    [],
  );
  /** 用于读取一页并在失败时保留已有结果。 */
  async function read(cursor?: string): Promise<void> {
    setLoad((current) => ({ loading: true, nextCursor: current.nextCursor }));
    const result = await listKnowledgeBases(cursor);
    if (!result.ok) {
      setLoad((current) => ({ ...current, error: result.error, loading: false }));
      return;
    }
    setItems((current) => (cursor ? [...current, ...result.data.items] : result.data.items));
    setLoad({ loading: false, nextCursor: result.data.nextCursor });
  }
  return { items, load, read };
}
