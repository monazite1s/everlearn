/** @fileoverview 读取当前知识库搜索范围并在离线后保留已确认名称。 */

'use client';

import { useEffect, useState } from 'react';

import type { KnowledgeBaseSummary } from '@everlearn/contracts';

import { getKnowledgeBase } from '../knowledge/knowledge-api';
import type { SearchFilters } from './search-url';

export type ScopeLoad =
  | { readonly status: 'all' }
  | { readonly status: 'failed'; readonly message: string }
  | { readonly status: 'loading' | 'offline' | 'unavailable' }
  | { readonly knowledgeBase: KnowledgeBaseSummary; readonly status: 'ready' };

type StoredScope = Exclude<ScopeLoad, { readonly status: 'all' | 'loading' | 'offline' }> & {
  readonly id: string;
};

/** 用于把已读取缓存与当前范围、网络状态合成为页面状态。 */
function currentScope(
  filters: SearchFilters,
  online: boolean,
  stored: StoredScope | undefined,
): ScopeLoad {
  if (filters.scope === 'all') return { status: 'all' };
  if (!filters.knowledgeBaseId) return { status: 'unavailable' };
  if (stored?.id === filters.knowledgeBaseId && stored.status === 'ready') return stored;
  if (!online) return { status: 'offline' };
  if (stored?.id !== filters.knowledgeBaseId) return { status: 'loading' };
  return stored;
}

/** 用于独立读取当前知识库范围且丢弃迟到详情响应。 */
export function useSearchScope(
  filters: SearchFilters,
  online: boolean,
): readonly [ScopeLoad, () => void] {
  const [attempt, setAttempt] = useState(0);
  const [stored, setStored] = useState<StoredScope | undefined>(undefined);
  useEffect(
    /** 用于只在在线当前库范围读取公开名称。 */
    function readScope(): () => void {
      let active = true;
      const id = filters.knowledgeBaseId;
      if (filters.scope !== 'knowledgeBase' || !online || !id) return () => undefined;
      void getKnowledgeBase(id).then((result) => {
        if (!active) return;
        if (result.ok) setStored({ id, knowledgeBase: result.data, status: 'ready' });
        else if (result.error.code === 'NOT_FOUND') setStored({ id, status: 'unavailable' });
        else setStored({ id, message: result.error.message, status: 'failed' });
      });
      return /** 用于忽略范围改变后的迟到详情。 */ function cancel(): void {
        active = false;
      };
    },
    [attempt, filters.knowledgeBaseId, filters.scope, online],
  );
  const retry = /** 用于清除失败缓存并开始下一次范围读取。 */ (): void => {
    setStored(undefined);
    setAttempt((current) => current + 1);
  };
  return [currentScope(filters, online, stored), retry];
}
