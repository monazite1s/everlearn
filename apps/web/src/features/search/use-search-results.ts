/** @fileoverview 管理搜索防抖、请求取消、迟到响应隔离与游标分页。 */

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';

import type { SearchErrorCode, SearchIndexStatus, SearchResultItem } from '@everlearn/contracts';

import type { ApiFailureEnvelope } from '../../shared/api-request';
import { searchDocuments } from './search-api';
import { toSearchRequest, type SearchFilters, updatedAfterFor } from './search-url';

interface SearchState {
  readonly error?: ApiFailureEnvelope<SearchErrorCode>;
  readonly indexStatus: SearchIndexStatus;
  readonly items: readonly SearchResultItem[];
  readonly nextCursor: string | null;
  readonly pageError?: ApiFailureEnvelope<SearchErrorCode>;
  readonly paging: boolean;
  readonly status: 'failed' | 'idle' | 'loading' | 'ready';
}

interface SearchSession {
  readonly filters: SearchFilters;
  readonly key: string;
  readonly updatedAfter?: string;
}

interface SearchExecutor {
  readonly requestPage: (session: SearchSession, cursor?: string) => Promise<void>;
  readonly startFirstPage: (filters: SearchFilters, key: string, preserve: boolean) => void;
}

interface SearchScheduleOptions {
  readonly enabled: boolean;
  readonly executor: SearchExecutor;
  readonly filters: SearchFilters;
  readonly online: boolean;
  readonly runtime: SearchRequestRuntime;
  readonly setState: Dispatch<SetStateAction<SearchState>>;
}

const INITIAL_STATE: SearchState = {
  indexStatus: 'ready',
  items: [],
  nextCursor: null,
  paging: false,
  status: 'idle',
};

/** 用于封装不参与渲染的请求代次、取消器、计时器和查询会话。 */
class SearchRequestRuntime {
  private activeKey: string;
  private controller?: AbortController;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private requestId = 0;
  private session?: SearchSession;

  /** 用于以首屏查询身份初始化协调器。 */
  constructor(initialKey: string) {
    this.activeKey = initialKey;
  }

  /** 用于取消旧请求并领取下一请求代次。 */
  begin(key: string): { readonly controller: AbortController; readonly requestId: number } {
    this.controller?.abort();
    this.activeKey = key;
    this.controller = new AbortController();
    this.requestId += 1;
    return { controller: this.controller, requestId: this.requestId };
  }

  /** 用于在查询变化时取消旧请求并使其响应失效。 */
  invalidate(key: string): void {
    this.controller?.abort();
    this.activeKey = key;
    this.requestId += 1;
  }

  /** 用于确认响应仍属于最新未取消查询。 */
  accepts(key: string, requestId: number, signal: AbortSignal): boolean {
    return !signal.aborted && key === this.activeKey && requestId === this.requestId;
  }

  /** 用于替换尚未执行的防抖任务。 */
  schedule(callback: () => void): void {
    this.clearSchedule();
    this.debounce = setTimeout(callback, 300);
  }

  /** 用于取消尚未执行的防抖任务。 */
  clearSchedule(): void {
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = undefined;
  }

  /** 用于保存相对时间固定的当前查询会话。 */
  setSession(session: SearchSession): void {
    this.session = session;
  }

  /** 用于读取分页必须沿用的查询会话。 */
  getSession(): SearchSession | undefined {
    return this.session;
  }
}

/** 用于生成不包含游标的请求身份，阻止迟到响应跨查询覆盖。 */
function searchKey(filters: SearchFilters): string {
  return JSON.stringify([
    filters.query.trim(),
    filters.scope,
    filters.knowledgeBaseId ?? null,
    filters.field,
    filters.updatedWithin,
  ]);
}

/** 用于按文档身份合并并发更新下可能重复的游标页。 */
function appendUnique(
  current: readonly SearchResultItem[],
  incoming: readonly SearchResultItem[],
): readonly SearchResultItem[] {
  const ids = new Set(current.map((item) => item.documentId));
  return [...current, ...incoming.filter((item) => !ids.has(item.documentId))];
}

/** 用于构造一次查询会话并固定相对更新时间边界。 */
function createSession(filters: SearchFilters, key: string): SearchSession {
  const updatedAfter = updatedAfterFor(filters.updatedWithin);
  return { filters, key, ...(updatedAfter ? { updatedAfter } : {}) };
}

/** 用于把成功页写入首次或追加结果状态。 */
function successfulPage(
  current: SearchState,
  result: Awaited<ReturnType<typeof searchDocuments>> & { readonly ok: true },
  append: boolean,
): SearchState {
  return {
    indexStatus: result.data.indexStatus,
    items: append ? appendUnique(current.items, result.data.items) : result.data.items,
    nextCursor: result.data.nextCursor,
    paging: false,
    status: 'ready',
  };
}

/** 用于创建受 Abort 与查询身份双重保护的请求执行器。 */
function useSearchExecutor(
  runtime: SearchRequestRuntime,
  setState: Dispatch<SetStateAction<SearchState>>,
): SearchExecutor {
  const requestPage = useCallback(
    /** 用于请求一页并仅接受当前查询身份的响应。 */
    async function requestPageForSession(session: SearchSession, cursor?: string): Promise<void> {
      const request = runtime.begin(session.key);
      const result = await searchDocuments(
        toSearchRequest(session.filters, session.updatedAfter, cursor),
        request.controller.signal,
      );
      if (!runtime.accepts(session.key, request.requestId, request.controller.signal)) return;
      if (!result.ok) {
        setState((current) =>
          cursor
            ? { ...current, pageError: result.error, paging: false }
            : { ...INITIAL_STATE, error: result.error, status: 'failed' },
        );
        return;
      }
      setState((current) => successfulPage(current, result, Boolean(cursor)));
    },
    [runtime, setState],
  );
  const startFirstPage = useCallback(
    /** 用于开始新会话并可在刷新时保留已有结果。 */
    function start(filters: SearchFilters, key: string, preserve: boolean): void {
      const session = createSession(filters, key);
      runtime.setSession(session);
      setState((current) => ({
        ...INITIAL_STATE,
        indexStatus: current.indexStatus,
        items: preserve ? current.items : [],
        status: 'loading',
      }));
      void requestPage(session);
    },
    [requestPage, runtime, setState],
  );
  return useMemo(() => ({ requestPage, startFirstPage }), [requestPage, startFirstPage]);
}

/** 用于在查询变化时取消旧请求并安排 300ms 搜索。 */
function useSearchSchedule(options: SearchScheduleOptions): void {
  const { enabled, executor, filters, online, runtime, setState } = options;
  const key = searchKey(filters);
  useEffect(
    /** 用于同步查询身份并注册可取消的状态与请求计时器。 */
    function scheduleSearch(): () => void {
      runtime.invalidate(key);
      const searchable = filters.query.trim().length > 0;
      const idleTimer = searchable ? undefined : setTimeout(() => setState(INITIAL_STATE), 0);
      const loadingTimer =
        searchable && enabled && online
          ? setTimeout(() => setState({ ...INITIAL_STATE, status: 'loading' }), 0)
          : undefined;
      if (searchable && enabled && online) {
        runtime.schedule(() => executor.startFirstPage(filters, key, false));
      }
      return /** 用于取消卸载或下一查询前的任务。 */ function cancel(): void {
        if (idleTimer) clearTimeout(idleTimer);
        if (loadingTimer) clearTimeout(loadingTimer);
        runtime.clearSchedule();
        runtime.invalidate(key);
      };
    },
    [key, enabled, executor, filters, online, runtime, setState],
  );
}

/** 搜索结果 Hook 的页面消费接口。 */
export interface SearchResultsController extends SearchState {
  readonly loadMore: () => void;
  readonly refresh: () => void;
  readonly retryPage: () => void;
  readonly submitNow: () => void;
}

/** 用于协调查询会话、取消信号和分页结果状态。 */
export function useSearchResults(options: {
  readonly enabled: boolean;
  readonly filters: SearchFilters;
  readonly online: boolean;
}): SearchResultsController {
  const initial =
    options.enabled && options.online && options.filters.query.trim() ? 'loading' : 'idle';
  const [state, setState] = useState<SearchState>({ ...INITIAL_STATE, status: initial });
  const [runtime] = useState(() => new SearchRequestRuntime(searchKey(options.filters)));
  const executor = useSearchExecutor(runtime, setState);
  useSearchSchedule({ ...options, executor, runtime, setState });
  const submitNow = /** 用于让 Enter 立即提交当前查询。 */ (): void => {
    if (!options.enabled || !options.online || !options.filters.query.trim()) return;
    runtime.clearSchedule();
    executor.startFirstPage(options.filters, searchKey(options.filters), false);
  };
  const refresh = /** 用于刷新当前查询并保留已有结果。 */ (): void => {
    if (options.enabled && options.online)
      executor.startFirstPage(options.filters, searchKey(options.filters), true);
  };
  const loadMore = /** 用于读取或重试当前会话的下一页。 */ (): void => {
    const session = runtime.getSession();
    if (!options.enabled || !options.online || !state.nextCursor || state.paging || !session)
      return;
    const cursor = state.nextCursor;
    setState((current) => {
      const remaining = { ...current };
      delete remaining.pageError;
      return { ...remaining, paging: true };
    });
    void executor.requestPage(session, cursor);
  };
  return { ...state, loadMore, refresh, retryPage: loadMore, submitNow };
}
