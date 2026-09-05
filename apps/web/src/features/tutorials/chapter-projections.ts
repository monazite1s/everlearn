/**
 * @fileoverview 同一份章节与 dependsOn 数据到树、列表、图三种投影的纯函数。
 */

import type { TutorialChapter } from './tutorials-contract';

/** 树视图的一行投影：依赖深度决定缩进层级。 */
export interface ChapterTreeRow {
  readonly chapter: TutorialChapter;
  readonly depth: number;
}

/** 用于计算每个章节的依赖深度，环依赖回退为同级避免死循环。 */
export function chapterDepths(chapters: readonly TutorialChapter[]): Map<string, number> {
  const depthOf = new Map<string, number>();
  const byNodeKey = new Map(chapters.map((chapter) => [chapter.nodeKey, chapter]));
  /** 用于以记忆化递归求单章深度，环依赖按 0 处理。 */
  const depth = (chapter: TutorialChapter, visiting: Set<string>): number => {
    const cached = depthOf.get(chapter.id);
    if (cached !== undefined) return cached;
    if (visiting.has(chapter.id)) return 0;
    visiting.add(chapter.id);
    let level = 0;
    for (const nodeKey of chapter.dependsOn) {
      const parent = byNodeKey.get(nodeKey);
      if (parent) level = Math.max(level, depth(parent, visiting) + 1);
    }
    visiting.delete(chapter.id);
    depthOf.set(chapter.id, level);
    return level;
  };
  for (const chapter of chapters) depth(chapter, new Set());
  return depthOf;
}

/** 用于把章节列表投影为按依赖深度缩进的树行序列。 */
export function treeRows(chapters: readonly TutorialChapter[]): ChapterTreeRow[] {
  const depths = chapterDepths(chapters);
  return chapters.map((chapter) => ({ chapter, depth: depths.get(chapter.id) ?? 0 }));
}

/** 用于把章节的依赖 nodeKey 解析为依赖章节标题，供列表与可访问名称使用。 */
export function dependencyTitles(
  chapters: readonly TutorialChapter[],
): (chapter: TutorialChapter) => string[] {
  const titles = new Map(chapters.map((chapter) => [chapter.nodeKey, chapter.title]));
  return (chapter) => chapter.dependsOn.map((nodeKey) => titles.get(nodeKey) ?? nodeKey);
}

/** 用于构建章节被依赖关系的反查表。 */
function buildDependents(chapters: readonly TutorialChapter[]): Map<string, string[]> {
  const byNodeKey = new Map(chapters.map((chapter) => [chapter.nodeKey, chapter]));
  const dependents = new Map<string, string[]>();
  for (const chapter of chapters) {
    for (const nodeKey of chapter.dependsOn) {
      const parent = byNodeKey.get(nodeKey);
      if (!parent) continue;
      dependents.set(parent.id, [...(dependents.get(parent.id) ?? []), chapter.id]);
    }
  }
  return dependents;
}

/** 用于求一个章节的双向邻居：依赖与被依赖。 */
function neighborsOf(
  chapter: TutorialChapter,
  chapters: readonly TutorialChapter[],
  dependents: Map<string, string[]>,
): string[] {
  const byNodeKey = new Map(chapters.map((chapter) => [chapter.nodeKey, chapter.id]));
  const parents = chapter.dependsOn
    .map((nodeKey) => byNodeKey.get(nodeKey))
    .filter((id): id is string => id !== undefined);
  return [...parents, ...(dependents.get(chapter.id) ?? [])];
}

/** 用于计算从锚点章节出发双向 N 跳内的章节 id 集合，供大图默认展开。 */
export function hopNeighborhood(
  chapters: readonly TutorialChapter[],
  anchorId: string | null,
  hops: number,
): Set<string> {
  const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
  const dependents = buildDependents(chapters);
  const anchor = byId.get(anchorId ?? '') ?? chapters[0];
  if (!anchor) return new Set();
  let frontier = [anchor.id];
  const seen = new Set(frontier);
  for (let hop = 0; hop < hops; hop += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      const chapter = byId.get(id);
      if (!chapter) continue;
      for (const neighbor of neighborsOf(chapter, chapters, dependents)) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
  }
  return seen;
}

/** 用于生成章节文档阅读路由，未完成章节返回 null。 */
export function chapterDocumentHref(
  chapter: TutorialChapter,
  knowledgeBaseId: string | null,
): string | null {
  if (knowledgeBaseId === null || chapter.documentId === null) return null;
  return `/knowledge/${knowledgeBaseId}/documents/${chapter.documentId}`;
}
