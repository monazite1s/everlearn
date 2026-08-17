/** @fileoverview 提供文档树纯函数模型：列表投影、移动请求与乐观快照。 */

import type { MoveDocumentRequest, DocumentTreeItem } from '@everlearn/contracts';

import type { DocumentApiFailure } from './document-api';

export interface DocumentChildList {
  readonly error?: DocumentApiFailure;
  readonly items: readonly DocumentTreeItem[];
  readonly loaded: boolean;
  readonly loading: boolean;
  readonly nextCursor: string | null;
}

export type ChildrenMap = Readonly<Record<string, DocumentChildList>>;

const EMPTY_CHILD_LIST: DocumentChildList = {
  items: [],
  loaded: false,
  loading: false,
  nextCursor: null,
};

export type DropIntent = 'into' | 'before' | 'after';

/** 用于描述一次移动的目标父级与相邻锚点。 */
export interface MovePlacement {
  readonly anchorId?: string;
  readonly intent: DropIntent;
  readonly targetParentId: string | null;
}

/** 用于向界面说明移动失败原因与是否可直接重试。 */
export interface MoveFailureInfo {
  readonly message: string;
  readonly retryable: boolean;
}

export type MoveOutcome =
  { readonly ok: true } | { readonly ok: false; readonly failure: MoveFailureInfo };

/** 用于把可空父节点收敛为子列表状态键。 */
export function keyOf(parentId?: string | null): string {
  return parentId ?? 'root';
}

/** 用于只读取已存在的子列表状态。 */
export function childListOf(children: ChildrenMap, key: string): DocumentChildList {
  return children[key] ?? EMPTY_CHILD_LIST;
}

/** 用于按标识在全部已加载列表中就地更新一个节点。 */
export function updateItem(
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

/** 用于跨全部已加载列表查找一个节点。 */
export function findItem(children: ChildrenMap, id: string): DocumentTreeItem | undefined {
  for (const list of Object.values(children)) {
    const hit = list.items.find((item) => item.id === id);
    if (hit) return hit;
  }
  return undefined;
}

/** 用于建立已加载节点到其父级键的映射。 */
export function parentMapOf(children: ChildrenMap): ReadonlyMap<string, string | null> {
  const map = new Map<string, string | null>();
  for (const [key, list] of Object.entries(children)) {
    for (const item of list.items) map.set(item.id, key === keyOf() ? null : key);
  }
  return map;
}

/** 用于收集一个节点在已加载范围内的全部后代。 */
function descendantIdsOf(children: ChildrenMap, id: string): ReadonlySet<string> {
  const seen = new Set<string>();
  const stack = [id];
  while (stack.length > 0) {
    const parent = stack.pop()!;
    for (const child of childListOf(children, keyOf(parent)).items) {
      if (!seen.has(child.id)) {
        seen.add(child.id);
        stack.push(child.id);
      }
    }
  }
  return seen;
}

/** 用于判断移动目标是否为节点自身或其已加载后代。 */
export function isInvalidMoveTarget(
  children: ChildrenMap,
  draggedId: string,
  targetId: string,
): boolean {
  return targetId === draggedId || descendantIdsOf(children, draggedId).has(targetId);
}

/** 用于构造互斥相邻锚点字段且不写入未定义键。 */
function anchorOf(placement: MovePlacement): { afterId?: string } | { beforeId?: string } {
  if (placement.anchorId === undefined) return {};
  return placement.intent === 'before'
    ? { beforeId: placement.anchorId }
    : { afterId: placement.anchorId };
}

/** 用于把放置意图转换为服务端移动契约载荷。 */
export function toMoveRequest(placement: MovePlacement, version: number): MoveDocumentRequest {
  const parent =
    placement.targetParentId === null ? {} : { targetParentId: placement.targetParentId };
  return { ...anchorOf(placement), ...parent, version };
}

interface LoadedNode {
  readonly item: DocumentTreeItem;
  readonly path: string;
}

/** 用于按展示顺序摊平已加载树并携带路径标签。 */
function flattenLoaded(children: ChildrenMap): readonly LoadedNode[] {
  const nodes: LoadedNode[] = [];
  /** 用于按序收集一层子节点并继续下钻。 */
  function walk(parentKey: string, prefix: string): void {
    for (const item of childListOf(children, parentKey).items) {
      const path = prefix === '' ? item.title : `${prefix} / ${item.title}`;
      nodes.push({ item, path });
      walk(item.id, path);
    }
  }
  walk(keyOf(), '');
  return nodes;
}

export const ROOT_PARENT_VALUE = '__root__';

export interface MoveParentOption {
  readonly disabled: boolean;
  readonly id: string;
  readonly label: string;
}

/** 用于枚举键盘移动的目标父级并禁用自身与后代。 */
export function moveParentOptions(
  children: ChildrenMap,
  draggedId: string,
): readonly MoveParentOption[] {
  const forbidden = descendantIdsOf(children, draggedId);
  const options: MoveParentOption[] = [
    { disabled: false, id: ROOT_PARENT_VALUE, label: '知识库顶层' },
  ];
  for (const node of flattenLoaded(children)) {
    const selfOrDescendant = node.item.id === draggedId || forbidden.has(node.item.id);
    options.push({
      disabled: selfOrDescendant,
      id: node.item.id,
      label: selfOrDescendant ? `${node.path}（自身或其后代）` : node.path,
    });
  }
  return options;
}

interface MoveSnapshot {
  readonly lists: Readonly<Record<string, DocumentChildList>>;
  readonly parentRows: readonly DocumentTreeItem[];
}

/** 用于捕获受影响父级行以便失败恢复计数。 */
function collectParentRows(
  children: ChildrenMap,
  keys: readonly string[],
): readonly DocumentTreeItem[] {
  const rows: DocumentTreeItem[] = [];
  for (const key of new Set(keys)) {
    if (key === keyOf()) continue;
    const row = findItem(children, key);
    if (row) rows.push(row);
  }
  return rows;
}

/** 用于乐观调整受影响父级行的子计数。 */
function adjustChildCount(children: ChildrenMap, parentKey: string, delta: number): ChildrenMap {
  if (parentKey === keyOf()) return children;
  return updateItem(children, parentKey, (parent) => ({
    ...parent,
    childCount: Math.max(0, parent.childCount + delta),
  }));
}

/** 用于计算乐观插入下标，锚点缺失时退化为末尾。 */
function insertionIndex(items: readonly DocumentTreeItem[], placement: MovePlacement): number {
  if (placement.intent !== 'into' && placement.anchorId !== undefined) {
    const anchorIndex = items.findIndex((item) => item.id === placement.anchorId);
    if (anchorIndex >= 0) return placement.intent === 'after' ? anchorIndex + 1 : anchorIndex;
  }
  return items.length;
}

/** 用于把一次移动乐观套用到受影响列表并留下恢复快照。 */
export function applyMove(
  children: ChildrenMap,
  draggedId: string,
  placement: MovePlacement,
): { children: ChildrenMap; snapshot: MoveSnapshot } {
  const sourceKey = keyOf(parentMapOf(children).get(draggedId) ?? null);
  const targetKey = keyOf(placement.targetParentId);
  const sourceList = childListOf(children, sourceKey);
  const targetList = childListOf(children, targetKey);
  const snapshot: MoveSnapshot = {
    lists: { [sourceKey]: sourceList, [targetKey]: targetList },
    parentRows: collectParentRows(children, [sourceKey, targetKey]),
  };
  const dragged = sourceList.items.find((item) => item.id === draggedId);
  if (!dragged) return { children, snapshot };
  const removed = sourceList.items.filter((item) => item.id !== draggedId);
  const base = targetKey === sourceKey ? removed : targetList.items;
  const index = insertionIndex(base, placement);
  const inserted = [...base.slice(0, index), dragged, ...base.slice(index)];
  let next: ChildrenMap = {
    ...children,
    [sourceKey]: { ...sourceList, items: removed },
    [targetKey]: {
      items: inserted,
      loaded: true,
      loading: false,
      nextCursor: targetList.nextCursor,
    },
  };
  next = adjustChildCount(next, sourceKey, -1);
  next = adjustChildCount(next, targetKey, 1);
  return { children: next, snapshot };
}

/** 用于按快照恢复受影响列表与父级行。 */
export function revertMove(children: ChildrenMap, snapshot: MoveSnapshot): ChildrenMap {
  let next: ChildrenMap = { ...children, ...snapshot.lists };
  for (const row of snapshot.parentRows) next = updateItem(next, row.id, () => row);
  return next;
}
