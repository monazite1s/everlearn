/** @fileoverview 定义文档树移动的环检测与相邻落位纯规则。 */

/** 同父兄弟间隔，取 1024 为中间插入与末尾追加预留空间。 */
export const SIBLING_POSITION_GAP = 1024n;

/** 用于承载同父活跃兄弟的排序事实。 */
export interface SiblingPosition {
  readonly id: string;
  readonly position: bigint;
}

/** 用于表达相邻落位锚点：某兄弟之前、之后或父级末尾。 */
export type MoveAnchor =
  | { readonly kind: 'end' }
  | { readonly kind: 'before'; readonly id: string }
  | { readonly kind: 'after'; readonly id: string };

/** 用于表达一次落位结果：可用的中间整数或整父重排顺序。 */
export type MovePlacement =
  | { readonly kind: 'position'; readonly position: bigint }
  | {
      readonly kind: 'rebalance';
      readonly movedPosition: bigint;
      readonly order: readonly string[];
    };

/** 用于判断目标父级是否为移动节点自身或其任意层级后代。 */
export function isSelfOrDescendantTarget(
  movedId: string,
  movedPath: string,
  targetId: string,
  targetPath: string,
): boolean {
  return targetId === movedId || targetPath.startsWith(`${movedPath}/`);
}

/** 用于把移动节点插入兄弟序列指定槽位并按间隔生成新顺序。 */
function rebalanceOrder(
  siblings: readonly SiblingPosition[],
  slot: number,
  movedId: string,
): { movedPosition: bigint; order: readonly string[] } {
  const ids = siblings.map((sibling) => sibling.id);
  ids.splice(slot, 0, movedId);
  return { movedPosition: BigInt(slot) * SIBLING_POSITION_GAP, order: ids };
}

/** 用于在活跃兄弟序列中计算新位置或返回耗尽间隔后的重排顺序。 */
export function computePlacement(
  siblings: readonly SiblingPosition[],
  anchor: MoveAnchor,
  movedId: string,
  maxPositionIncludingDeleted: bigint,
): MovePlacement {
  if (anchor.kind === 'end') {
    return { kind: 'position', position: maxPositionIncludingDeleted + SIBLING_POSITION_GAP };
  }
  const anchorIndex = siblings.findIndex((sibling) => sibling.id === anchor.id);
  if (anchorIndex < 0) throw new Error('Move anchor sibling is missing');
  const slot = anchor.kind === 'before' ? anchorIndex : anchorIndex + 1;
  const upper = siblings[slot];
  if (upper === undefined) {
    return { kind: 'position', position: maxPositionIncludingDeleted + SIBLING_POSITION_GAP };
  }
  const previous = slot === 0 ? undefined : siblings[slot - 1];
  const lower = previous?.position ?? -1n;
  const gap = upper.position - lower;
  if (gap < 2n) return { kind: 'rebalance', ...rebalanceOrder(siblings, slot, movedId) };
  return { kind: 'position', position: lower + gap / 2n };
}
