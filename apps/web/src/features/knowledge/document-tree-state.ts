/** @fileoverview 管理按需文档树的展开、子节点分页与本地同步。 */

'use client';

import type { DocumentDetail, DocumentTreeItem } from '@everlearn/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';

import { listDocuments } from './document-api';
import type { DocumentApiFailure } from './document-api';

export interface DocumentChildList {
  readonly error?: DocumentApiFailure;
  readonly items: readonly DocumentTreeItem[];
  readonly loaded: boolean;
  readonly loading: boolean;
  readonly nextCursor: string | null;
}

type ChildrenMap = Readonly<Record<string, DocumentChildList>>;

const EMPTY_CHILD_LIST: DocumentChildList = {
  items: [],
  loaded: false,
  loading: false,
  nextCursor: null,
};

/** 用于把可空父节点收敛为子列表状态键。 */
function keyOf(parentId?: string | null): string {
  return parentId ?? 'root';
}

/** 用于从详情投影出树节点所需的稳定字段。 */
function toTreeItem(detail: DocumentDetail): DocumentTreeItem {
  return {
    childCount: detail.childCount,
    id: detail.id,
    title: detail.title,
    updatedAt: detail.updatedAt,
    version: detail.version,
  };
}

/** 用于只读取已存在的子列表状态。 */
function childListOf(children: ChildrenMap, key: string): DocumentChildList {
  return children[key] ?? EMPTY_CHILD_LIST;
}

/** 用于按标识在全部已加载列表中就地更新一个节点。 */
function updateItem(
  children: ChildrenMap,
  id: string,
  update: (item: DocumentTreeItem) => DocumentTreeItem,
): ChildrenMap {
  const entries = Object.entries(children).map(([key, list]) => {
    const items = list.items.map((item) => (item.id === id ? update(item) : item));
    return [key, { ...list, items }] as [string, DocumentChildList];
  });
  return Object.fromEntries(entries);
}

/** 用于把创建结果并入兄弟列表并递增父级计数。 */
// ponytail: 兄弟列表在途时跳过并入（窄时序下新文档需手动重试可见）；升级路径为按 key 合并在途响应与新节点。
function mergeCreated(current: ChildrenMap, detail: DocumentDetail): ChildrenMap {
  const key = keyOf(detail.parentId);
  const siblings = childListOf(current, key);
  const withSibling = siblings.loaded
    ? {
        ...current,
        [key]: { ...siblings, items: [...siblings.items, toTreeItem(detail)] },
      }
    : current;
  if (detail.parentId === null) return withSibling;
  return updateItem(withSibling, detail.parentId, (parent) => ({
    ...parent,
    childCount: parent.childCount + 1,
  }));
}

/** 用于把一个父节点的子列表标记为读取中。 */
function markLoading(setChildren: Dispatch<SetStateAction<ChildrenMap>>, key: string): void {
  setChildren((current) => ({
    ...current,
    [key]: { ...childListOf(current, key), loading: true },
  }));
}

/** 用于提供子节点分页读取并在挂载时同步根列表。 */
function useDocumentReader(
  knowledgeBaseId: string,
  aliveRef: RefObject<boolean>,
  setChildren: Dispatch<SetStateAction<ChildrenMap>>,
) {
  const read = useCallback(
    /** 用于读取一个父节点的子节点页并保留已加载内容。 */
    async function readChildren(parentId?: string | null, cursor?: string): Promise<void> {
      const key = keyOf(parentId);
      const result = await listDocuments(knowledgeBaseId, parentId ?? undefined, cursor);
      if (!aliveRef.current) return;
      setChildren((current) => {
        const previous = childListOf(current, key);
        if (!result.ok) {
          return { ...current, [key]: { ...previous, error: result.error, loading: false } };
        }
        return {
          ...current,
          [key]: {
            items: cursor ? [...previous.items, ...result.data.items] : result.data.items,
            loaded: true,
            loading: false,
            nextCursor: result.data.nextCursor,
          },
        };
      });
    },
    [aliveRef, knowledgeBaseId, setChildren],
  );
  useEffect(
    /** 用于挂载时读取根节点第一页并在卸载后忽略过期响应。 */
    function loadRoot(): () => void {
      aliveRef.current = true;
      void read();
      return /** 用于让卸载后的响应不再写入状态。 */ function markInactive(): void {
        aliveRef.current = false;
      };
    },
    [aliveRef, read],
  );
  return read;
}

/** 用于提供展开、重试、分页与本地同步操作。 */
function useTreeActions(props: {
  aliveRef: RefObject<boolean>;
  children: ChildrenMap;
  expanded: ReadonlySet<string>;
  read: (parentId?: string | null, cursor?: string) => Promise<void>;
  setChildren: Dispatch<SetStateAction<ChildrenMap>>;
  setExpanded: Dispatch<SetStateAction<ReadonlySet<string>>>;
}) {
  const { children, expanded, read, setChildren, setExpanded } = props;
  /** 用于展开或折叠节点并按需拉取直接子节点。 */
  // ponytail: 展开在途未去重，快速折叠再展开会重复请求（整页替换无数据损坏）；升级路径为在途时忽略同 key 读取。
  function toggle(item: DocumentTreeItem): void {
    const willExpand = !expanded.has(item.id);
    setExpanded((current) => {
      const next = new Set(current);
      if (willExpand) next.add(item.id);
      else next.delete(item.id);
      return next;
    });
    if (willExpand && item.childCount > 0 && !childListOf(children, item.id).loaded) {
      markLoading(setChildren, item.id);
      void read(item.id);
    }
  }
  /** 用于按当前分页进度重试失败的读取。 */
  function retry(parentId?: string | null): void {
    const list = childListOf(children, keyOf(parentId));
    const cursor = list.loaded ? (list.nextCursor ?? undefined) : undefined;
    markLoading(setChildren, keyOf(parentId));
    void read(parentId, cursor);
  }
  /** 用于继续读取同一父节点的下一页。 */
  function loadMore(parentId?: string | null): void {
    const cursor = childListOf(children, keyOf(parentId)).nextCursor ?? undefined;
    markLoading(setChildren, keyOf(parentId));
    void read(parentId, cursor);
  }
  /** 用于把创建成功的文档并入受影响的兄弟列表。 */
  function applyCreated(detail: DocumentDetail): void {
    setChildren((current) => mergeCreated(current, detail));
  }
  /** 用于把服务端确认的详情同步回树节点。 */
  function applyDetail(detail: DocumentDetail): void {
    setChildren((current) => updateItem(current, detail.id, () => toTreeItem(detail)));
  }
  return { applyCreated, applyDetail, loadMore, retry, toggle };
}

/** 用于驱动按需文档树的读取、展开与本地更新。 */
export function useDocumentTree(knowledgeBaseId: string) {
  const [children, setChildren] = useState<ChildrenMap>(() => ({
    root: { ...EMPTY_CHILD_LIST, loading: true },
  }));
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const aliveRef = useRef(true);
  const read = useDocumentReader(knowledgeBaseId, aliveRef, setChildren);
  const actions = useTreeActions({ aliveRef, children, expanded, read, setChildren, setExpanded });
  /** 用于读取指定父节点的子列表状态。 */
  function childList(parentId?: string | null): DocumentChildList {
    return childListOf(children, keyOf(parentId));
  }
  /** 用于判断节点当前是否展开。 */
  function isExpanded(id: string): boolean {
    return expanded.has(id);
  }
  return { ...actions, childList, isExpanded };
}
