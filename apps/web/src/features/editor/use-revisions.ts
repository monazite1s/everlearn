/** @fileoverview 管理修订摘要列表的首屏加载、游标翻页与权威刷新。 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { DocumentRevisionListItem } from '@everlearn/contracts';

import { listDocumentRevisions } from './editor-api';

/** 修订列表的稳定加载状态。 */
export type RevisionListStatus = 'loading' | 'loaded' | 'failed';

/** useRevisions 的配置契约。 */
export interface RevisionsOptions {
  readonly documentId: string;
}

/** 暴露给修订侧栏的列表控制器。 */
export interface RevisionsController {
  readonly items: readonly DocumentRevisionListItem[];
  readonly nextCursor: string | null;
  readonly paging: boolean;
  readonly status: RevisionListStatus;
  readonly loadMore: () => void;
  /** 用于失败重试与恢复后的权威刷新，均从第一页重读。 */
  readonly reload: () => void;
}

/** 列表的响应式状态。 */
interface RevisionListState {
  items: readonly DocumentRevisionListItem[];
  nextCursor: string | null;
  paging: boolean;
  status: RevisionListStatus;
}

const EMPTY_STATE: RevisionListState = {
  items: [],
  nextCursor: null,
  paging: false,
  status: 'loading',
};

/** 用于把读取结果收敛为列表状态，追加时保留已加载页。 */
function toListState(
  result: Awaited<ReturnType<typeof listDocumentRevisions>>,
  append: boolean,
  previous: readonly DocumentRevisionListItem[],
  cursor: string | null,
): RevisionListState {
  if (!result.ok) {
    return {
      items: append ? previous : [],
      nextCursor: append ? cursor : null,
      paging: false,
      status: 'failed',
    };
  }
  return {
    items: append ? [...previous, ...result.data.items] : result.data.items,
    nextCursor: result.data.nextCursor,
    paging: false,
    status: 'loaded',
  };
}

/** 单页读取所需的定位与回调集合。 */
interface RevisionPageRequest {
  readonly append: boolean;
  readonly apply: (state: RevisionListState) => void;
  readonly cursor: string | undefined;
  readonly documentId: string;
  readonly previous: readonly DocumentRevisionListItem[];
  readonly requestRef: { current: number };
}

/** 构造单页请求所需的公共定位集合。 */
interface RevisionQuery {
  readonly apply: (state: RevisionListState) => void;
  readonly documentId: string;
  readonly items: readonly DocumentRevisionListItem[];
  readonly requestRef: { current: number };
}

/** 用于构造首页读取请求。 */
function firstPage(query: RevisionQuery): RevisionPageRequest {
  return {
    append: false,
    apply: query.apply,
    cursor: undefined,
    documentId: query.documentId,
    previous: query.items,
    requestRef: query.requestRef,
  };
}

/** 用于构造追加读取请求。 */
function nextPage(query: RevisionQuery, cursor: string): RevisionPageRequest {
  return {
    append: true,
    apply: query.apply,
    cursor,
    documentId: query.documentId,
    previous: query.items,
    requestRef: query.requestRef,
  };
}

/** 用于读取一页修订并在请求序号未过期时应用结果。 */
async function readRevisionPage(request: RevisionPageRequest): Promise<void> {
  const requestId = request.requestRef.current + 1;
  request.requestRef.current = requestId;
  const result = await listDocumentRevisions(request.documentId, request.cursor);
  if (request.requestRef.current !== requestId) return;
  request.apply(toListState(result, request.append, request.previous, request.cursor ?? null));
}

/** 用于把公共定位集合收敛为查询对象。 */
function toQuery(
  documentId: string,
  itemsRef: { current: readonly DocumentRevisionListItem[] },
  requestRef: { current: number },
  apply: (state: RevisionListState) => void,
): RevisionQuery {
  return { apply, documentId, items: itemsRef.current, requestRef };
}

/** 用于加载修订摘要分页并在恢复后支持权威刷新。 */
export function useRevisions(options: RevisionsOptions): RevisionsController {
  const { documentId } = options;
  const [state, setState] = useState<RevisionListState>(EMPTY_STATE);
  const requestRef = useRef(0);
  const itemsRef = useRef<readonly DocumentRevisionListItem[]>([]);
  const { nextCursor, paging, status } = state;

  /** 用于应用一页结果并同步已加载页。 */
  const applyPage = useCallback((next: RevisionListState) => {
    itemsRef.current = next.items;
    setState(next);
  }, []);

  /** 用于在文档切换或重试后重读第一页。 */
  const reload = useCallback(
    () => void readRevisionPage(firstPage(toQuery(documentId, itemsRef, requestRef, applyPage))),
    [applyPage, documentId],
  );

  useEffect(() => {
    reload();
    return /** 用于丢弃文档切换后的在途响应。 */ () => {
      requestRef.current += 1;
    };
  }, [reload]);

  /** 用于按当前游标追加下一页。 */
  const loadMore = useCallback(() => {
    if (nextCursor === null || paging || status === 'loading') return;
    setState((current) => ({ ...current, paging: true }));
    void readRevisionPage(
      nextPage(toQuery(documentId, itemsRef, requestRef, applyPage), nextCursor),
    );
  }, [applyPage, documentId, nextCursor, paging, status]);

  return {
    items: state.items,
    loadMore,
    nextCursor: state.nextCursor,
    paging: state.paging,
    reload,
    status: state.status,
  };
}
