/** @fileoverview 管理按需文档树的展开、子节点分页、本地同步与移动编排。 */

'use client';

import type { DocumentDetail, DocumentTreeItem } from '@everlearn/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';

import { listDocuments, moveDocument } from './document-api';
import type { DocumentApiFailure } from './document-api';
import {
  applyMove,
  childListOf,
  findItem,
  isInvalidMoveTarget,
  keyOf,
  moveParentOptions,
  parentMapOf,
  revertMove,
  toMoveRequest,
  updateItem,
} from './document-tree-model';
import type {
  ChildrenMap,
  DocumentChildList,
  MoveFailureInfo,
  MoveOutcome,
  MoveParentOption,
  MovePlacement,
} from './document-tree-model';

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

/** 用于把移动失败映射为可行动提示。 */
function moveFailureOf(error: DocumentApiFailure): MoveFailureInfo {
  if (error.code === 'VERSION_CONFLICT') {
    return {
      message: '文档在别处被修改，列表已恢复为最新状态，请重新选择位置。',
      retryable: false,
    };
  }
  if (error.code === 'IDEMPOTENCY_CONFLICT') {
    return { message: '本次移动与上一次重复提交不一致，请再次提交完成移动。', retryable: true };
  }
  if (error.code === 'NOT_FOUND') {
    return { message: '文档或目标位置已不存在，列表已恢复为最新状态。', retryable: false };
  }
  if (error.certainty === 'unknown') {
    return { message: '无法连接文档服务，已恢复移动前的位置，请重试移动。', retryable: true };
  }
  return { message: error.message, retryable: false };
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

/** 用于按移动意图在移入未展开目标时切换其展开态。 */
function toggleOptimisticExpansion(
  setExpanded: Dispatch<SetStateAction<ReadonlySet<string>>>,
  targetId: string | null,
  reveal: boolean,
): void {
  if (targetId === null) return;
  setExpanded((current) => {
    const next = new Set(current);
    if (reveal) next.add(targetId);
    else next.delete(targetId);
    return next;
  });
}

/** 用于提供移动编排：幂等键、乐观套用、失败恢复与服务端对账。 */
function useTreeMoveActions(props: {
  children: ChildrenMap;
  expanded: ReadonlySet<string>;
  read: (parentId?: string | null, cursor?: string) => Promise<void>;
  setChildren: Dispatch<SetStateAction<ChildrenMap>>;
  setExpanded: Dispatch<SetStateAction<ReadonlySet<string>>>;
}) {
  const { children, expanded, read, setChildren, setExpanded } = props;
  const moveKeyRef = useRef<{ fingerprint: string; key: string } | undefined>(undefined);
  /** 用于在重试同一移动请求时复用幂等键。 */
  function idempotencyKeyFor(fingerprint: string): string {
    if (moveKeyRef.current?.fingerprint === fingerprint) return moveKeyRef.current.key;
    const key = crypto.randomUUID();
    moveKeyRef.current = { fingerprint, key };
    return key;
  }
  /** 用于在移动结束后重读受影响的两个父列表（null 表示根列表）。 */
  async function rereadParents(source: string | null, target: string | null): Promise<void> {
    const parents = [...new Set([source, target])];
    await Promise.all(parents.map((id) => read(id)));
  }
  /** 用于提交一次移动：乐观套用、失败恢复与服务端对账。 */
  // ponytail: 移动在途时同节点再次拖拽以服务端串行结果收敛（不排队等待）；升级路径为按节点在途锁。
  async function move(draggedId: string, placement: MovePlacement): Promise<MoveOutcome> {
    const dragged = findItem(children, draggedId);
    if (!dragged) return { ok: true };
    const sourceParentId = parentMapOf(children).get(draggedId) ?? null;
    const request = toMoveRequest(placement, dragged.version);
    const key = idempotencyKeyFor(JSON.stringify([draggedId, request]));
    const applied = applyMove(children, draggedId, placement);
    const targetId = placement.targetParentId;
    const optimisticReveal =
      placement.intent === 'into' && targetId !== null && !expanded.has(targetId);
    setChildren(applied.children);
    if (optimisticReveal) toggleOptimisticExpansion(setExpanded, targetId, true);
    const result = await moveDocument(draggedId, request, key);
    if (result.ok) {
      setChildren((current) => updateItem(current, draggedId, () => toTreeItem(result.data)));
      await rereadParents(sourceParentId, placement.targetParentId);
      return { ok: true };
    }
    if (result.error.code === 'IDEMPOTENCY_CONFLICT') moveKeyRef.current = undefined;
    setChildren((current) => revertMove(current, applied.snapshot));
    if (optimisticReveal) toggleOptimisticExpansion(setExpanded, targetId, false);
    if (result.error.certainty === 'known')
      await rereadParents(sourceParentId, placement.targetParentId);
    return { ok: false, failure: moveFailureOf(result.error) };
  }
  return { move };
}

/** 用于提供展开、重试、分页与本地同步。 */
function useTreeActions(props: {
  aliveRef: RefObject<boolean>;
  children: ChildrenMap;
  expanded: ReadonlySet<string>;
  read: (parentId?: string | null, cursor?: string) => Promise<void>;
  setChildren: Dispatch<SetStateAction<ChildrenMap>>;
  setExpanded: Dispatch<SetStateAction<ReadonlySet<string>>>;
}) {
  const { children, expanded, read, setChildren, setExpanded } = props;
  const moveActions = useTreeMoveActions({ children, expanded, read, setChildren, setExpanded });
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
  return { ...moveActions, applyCreated, applyDetail, loadMore, retry, toggle };
}

/** 用于驱动按需文档树的读取、展开、本地更新与移动。 */
export function useDocumentTree(knowledgeBaseId: string) {
  const [children, setChildren] = useState<ChildrenMap>(() => ({
    root: { items: [], loaded: false, loading: true, nextCursor: null },
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
  /** 用于查询节点最后观察的父级。 */
  function parentIdOf(id: string): string | null {
    return parentMapOf(children).get(id) ?? null;
  }
  /** 用于枚举键盘移动对话框的目标父级。 */
  function moveOptionsFor(draggedId: string): readonly MoveParentOption[] {
    return moveParentOptions(children, draggedId);
  }
  /** 用于判断移动目标是否为节点自身或已加载后代。 */
  function invalidMoveTarget(draggedId: string, targetId: string): boolean {
    return isInvalidMoveTarget(children, draggedId, targetId);
  }
  return {
    ...actions,
    childList,
    isExpanded,
    isInvalidMoveTarget: invalidMoveTarget,
    moveOptionsFor,
    parentIdOf,
  };
}
