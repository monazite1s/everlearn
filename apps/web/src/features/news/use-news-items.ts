/**
 * @fileoverview 管理条目流过滤会话、请求取消、迟到响应隔离与游标分页。
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { listNewsItems } from './news-api';
import type { NewsItemFilters, NewsItemSummary } from './news-api';

/** 条目流读取状态。 */
interface ItemsState {
  readonly items: readonly NewsItemSummary[];
  readonly message?: string | undefined;
  readonly nextCursor: string | null;
  readonly pageMessage?: string | undefined;
  readonly paging: boolean;
  readonly status: 'failed' | 'loading' | 'ready';
}

/** 一次过滤会话的运行时：取消器、代次与当前过滤。 */
interface ItemsSession {
  controller?: AbortController;
  filters: NewsItemFilters;
  requestId: number;
}

const INITIAL_STATE: ItemsState = { items: [], nextCursor: null, paging: false, status: 'loading' };

/** 用于按条目身份去重合并游标页。 */
function appendUnique(
  current: readonly NewsItemSummary[],
  incoming: readonly NewsItemSummary[],
): readonly NewsItemSummary[] {
  const ids = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !ids.has(item.id))];
}

/** 用于读取一页条目并只接受当前过滤会话的响应。 */
async function fetchPage(
  session: ItemsSession,
  filters: NewsItemFilters,
  cursor: string | undefined,
  setState: Dispatch<SetStateAction<ItemsState>>,
): Promise<void> {
  session.controller?.abort();
  const controller = new AbortController();
  session.controller = controller;
  const requestId = (session.requestId += 1);
  const result = await listNewsItems(filters, controller.signal, cursor);
  if (requestId !== session.requestId || controller.signal.aborted) return;
  if (!result.ok) {
    setState((current) =>
      cursor
        ? { ...current, pageMessage: result.error.message, paging: false }
        : { ...INITIAL_STATE, message: result.error.message, status: 'failed' },
    );
    return;
  }
  setState((current) => ({
    items: cursor ? appendUnique(current.items, result.data.items) : result.data.items,
    nextCursor: result.data.nextCursor,
    paging: false,
    status: 'ready',
  }));
}

/** 用于安排一次会话重置：离线保活或延时从第一页重读。 */
function scheduleSession(
  session: ItemsSession,
  filters: NewsItemFilters,
  online: boolean,
  setState: Dispatch<SetStateAction<ItemsState>>,
): () => void {
  session.filters = filters;
  session.requestId += 1;
  session.controller?.abort();
  if (!online) {
    const offlineTimer = setTimeout(
      () =>
        setState((current) => ({ ...current, nextCursor: null, paging: false, status: 'ready' })),
      0,
    );
    return /** 用于清除离线下未触发的任务。 */ function cancelOffline(): void {
      clearTimeout(offlineTimer);
      session.requestId += 1;
    };
  }
  const loadTimer = setTimeout(() => {
    setState(INITIAL_STATE);
    void fetchPage(session, filters, undefined, setState);
  }, 0);
  return /** 用于取消切换会话前的在途请求。 */ function cancelInFlight(): void {
    clearTimeout(loadTimer);
    session.requestId += 1;
    session.controller?.abort();
  };
}

/** 条目流 Hook 的页面消费接口。 */
export interface NewsItemsController extends ItemsState {
  readonly loadMore: () => void;
  readonly retryFirst: () => void;
}

/** 用于协调条目流过滤、分页与迟到响应隔离。 */
export function useNewsItems(filters: NewsItemFilters, online: boolean): NewsItemsController {
  const [state, setState] = useState<ItemsState>(INITIAL_STATE);
  const [attempt, setAttempt] = useState(0);
  const session = useRef<ItemsSession>({ filters, requestId: 0 });

  useEffect(
    /** 用于在过滤或在线状态变化时重置会话并从第一页重读。 */
    function resynchronize(): () => void {
      return scheduleSession(session.current, filters, online, setState);
    },
    [filters, online, attempt],
  );

  const loadMore = /** 用于读取当前会话的下一页。 */ useCallback(
    function fetchNextPage(): void {
      const current = session.current;
      if (!online || state.nextCursor === null || state.paging) return;
      const cursor = state.nextCursor;
      setState((previous) => {
        const remaining = { ...previous };
        delete remaining.pageMessage;
        return { ...remaining, paging: true };
      });
      void fetchPage(current, current.filters, cursor, setState);
    },
    [online, state.nextCursor, state.paging],
  );

  const retryFirst = /** 用于首屏失败后就地重读第一页。 */ useCallback(
    function retryFirstPage(): void {
      setAttempt((current) => current + 1);
    },
    [],
  );

  return { ...state, loadMore, retryFirst };
}
