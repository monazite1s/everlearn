/**
 * @fileoverview 管理简报按日列表的读取、分页与就地重试。
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import { listNewsDigests } from './news-api';
import type { NewsDigestSummary } from './news-api';

/** 简报列表读取状态。 */
export interface NewsDigestsState {
  readonly items: readonly NewsDigestSummary[];
  readonly message?: string | undefined;
  readonly nextCursor: string | null;
  readonly paging: boolean;
  readonly status: 'failed' | 'idle' | 'loading' | 'ready';
}

const INITIAL_STATE: NewsDigestsState = {
  items: [],
  nextCursor: null,
  paging: false,
  status: 'idle',
};

/** 用于读取一页简报并按调用代次丢弃过期响应。 */
async function fetchDigestPage(
  requestId: { current: number },
  cursor: string | undefined,
  setState: Dispatch<SetStateAction<NewsDigestsState>>,
): Promise<void> {
  const current = (requestId.current += 1);
  const controller = new AbortController();
  const result = await listNewsDigests(controller.signal, cursor);
  if (current !== requestId.current || controller.signal.aborted) return;
  if (!result.ok) {
    setState((previous) =>
      cursor
        ? { ...previous, message: result.error.message, paging: false }
        : {
            items: [],
            message: result.error.message,
            nextCursor: null,
            paging: false,
            status: 'failed',
          },
    );
    return;
  }
  setState((previous) => ({
    items: cursor ? [...previous.items, ...result.data.items] : result.data.items,
    nextCursor: result.data.nextCursor,
    paging: false,
    status: 'ready',
  }));
}

/** 简报列表 Hook 的消费接口。 */
export interface NewsDigestsController extends NewsDigestsState {
  readonly loadMore: () => void;
  readonly retry: () => void;
}

/** 用于在简报 tab 激活时读取按日列表并支持分页。 */
export function useNewsDigests(active: boolean, online: boolean): NewsDigestsController {
  const [state, setState] = useState<NewsDigestsState>(INITIAL_STATE);
  const [attempt, setAttempt] = useState(0);
  const requestId = useRef(0);

  useEffect(
    /** 用于在 tab 激活或恢复在线时读取第一页。 */
    function synchronizeDigests(): () => void {
      requestId.current += 1;
      if (!active || !online) {
        const idleTimer = setTimeout(
          () => setState((previous) => ({ ...previous, nextCursor: null, paging: false })),
          0,
        );
        return /** 用于清除未触发的空闲任务。 */ function cancelIdle(): void {
          clearTimeout(idleTimer);
          requestId.current += 1;
        };
      }
      const loadTimer = setTimeout(() => {
        setState((previous) => ({ ...INITIAL_STATE, items: previous.items, status: 'loading' }));
        void fetchDigestPage(requestId, undefined, setState);
      }, 0);
      return /** 用于使卸载后在途响应失效。 */ function invalidate(): void {
        clearTimeout(loadTimer);
        requestId.current += 1;
      };
    },
    [active, online, attempt],
  );

  const loadMore = /** 用于读取下一页简报。 */ useCallback(
    function fetchNextPage(): void {
      if (!active || !online || state.nextCursor === null || state.paging) return;
      const cursor = state.nextCursor;
      setState((previous) => ({ ...previous, paging: true }));
      void fetchDigestPage(requestId, cursor, setState);
    },
    [active, online, state.nextCursor, state.paging],
  );

  const retry = /** 用于失败后就地重读第一页。 */ useCallback(function retryFirstPage(): void {
    setAttempt((current) => current + 1);
  }, []);

  return { ...state, loadMore, retry };
}
