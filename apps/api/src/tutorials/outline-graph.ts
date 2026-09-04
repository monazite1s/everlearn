/**
 * @fileoverview 校验大纲编辑输入并实现章节依赖的环检测纯函数。
 */

import type { TutorialOutline } from './tutorial.dto';

/** 大纲校验失败原因。 */
export type OutlineIssue =
  'chapter_empty' | 'dependency_cycle' | 'duplicate_node_key' | 'missing_dependency';

/** 大纲校验结果。 */
export interface OutlineValidation {
  readonly issue: OutlineIssue | null;
  readonly ok: boolean;
}

/** 用于检测有向图中是否存在环（迭代 DFS 三色标记）。 */
export function hasDependencyCycle(
  nodes: readonly string[],
  edges: ReadonlyMap<string, readonly string[]>,
): boolean {
  const state = new Map<string, 0 | 1 | 2>(nodes.map((node) => [node, 0 as const]));
  for (const root of nodes) {
    if (state.get(root) !== 0) continue;
    const stack: { enter: boolean; node: string }[] = [{ enter: true, node: root }];
    while (stack.length > 0) {
      const frame = stack.pop()!;
      if (!frame.enter) {
        state.set(frame.node, 2);
        continue;
      }
      if (state.get(frame.node) !== 0) continue;
      state.set(frame.node, 1);
      stack.push({ enter: false, node: frame.node });
      for (const next of edges.get(frame.node) ?? []) {
        const mark = state.get(next);
        if (mark === 1) return true;
        if (mark === 0) stack.push({ enter: true, node: next });
      }
    }
  }
  return false;
}

/** 用于整体校验大纲：nodeKey 唯一、依赖存在且无环。 */
export function validateOutline(outline: TutorialOutline): OutlineValidation {
  const chapters = outline.chapters ?? [];
  if (chapters.length === 0) return { issue: 'chapter_empty', ok: false };
  const nodeKeys = new Set<string>();
  for (const chapter of chapters) {
    if (nodeKeys.has(chapter.nodeKey)) return { issue: 'duplicate_node_key', ok: false };
    nodeKeys.add(chapter.nodeKey);
  }
  const edges = new Map<string, readonly string[]>();
  for (const chapter of chapters) {
    const dependsOn = chapter.dependsOn ?? [];
    if (dependsOn.some((key) => !nodeKeys.has(key))) {
      return { issue: 'missing_dependency', ok: false };
    }
    edges.set(chapter.nodeKey, dependsOn);
  }
  if (hasDependencyCycle([...nodeKeys], edges)) return { issue: 'dependency_cycle', ok: false };
  return { issue: null, ok: true };
}
