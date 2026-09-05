/**
 * @fileoverview 提供教程会话行与公开契约之间的投影函数。
 */

import type {
  TutorialChapterView,
  TutorialContinueTarget,
  TutorialDetail,
  TutorialOutline,
  TutorialProgressView,
  TutorialStageView,
  TutorialSummary,
} from './tutorial.dto';
import type { TutorialScopeDto } from './tutorial-scope.dto';

/** 章节行的最小读取投影，列表与详情共用。 */
export interface ChapterRowForProjection {
  readonly document_id: string | null;
  readonly id: string;
  readonly node_key: string;
  readonly status: string;
  readonly title: string;
}

/** 会话行的最小读取投影，列表与详情共用。 */
export interface SessionRowForProjection {
  readonly created_at: Date;
  readonly id: string;
  readonly status: string;
  readonly topic: string;
  readonly tutorial_kb_id: string | null;
  readonly updated_at: Date;
}

/** 用于把 DTO 投影为会话范围列。 */
export function toScopeRow(input: TutorialScopeDto) {
  return {
    audience: input.audience,
    depth: input.depth,
    exclude_topics: input.excludeTopics,
    goals: input.goals,
    include_topics: input.includeTopics,
    kb_scope: input.knowledgeBaseIds,
    level: input.level,
    topic: input.topic,
  };
}

/** 用于把会话行投影为公开范围字段。 */
export function toScopeView(row: {
  audience: string;
  depth: string;
  exclude_topics: string[];
  goals: string;
  include_topics: string[];
  kb_scope: string[];
  level: number;
  topic: string;
}) {
  return {
    audience: row.audience,
    depth: row.depth as TutorialScopeDto['depth'],
    excludeTopics: row.exclude_topics,
    goals: row.goals,
    includeTopics: row.include_topics,
    knowledgeBaseIds: row.kb_scope,
    level: row.level,
    topic: row.topic,
  };
}

/** 用于把章节行投影为公开视图并回填大纲摘要。 */
export function toChapterView(
  row: {
    attempt: number;
    depends_on: string[];
    document_id: string | null;
    error_code: string | null;
    id: string;
    node_key: string;
    status: string;
    title: string;
  },
  summary: string,
): TutorialChapterView {
  return {
    attempt: row.attempt,
    dependsOn: row.depends_on,
    documentId: row.document_id,
    errorCode: row.error_code,
    id: row.id,
    nodeKey: row.node_key,
    status: row.status,
    summary,
    title: row.title,
  };
}

/** 用于把 warnings jsonb 投影为字符串列表。 */
export function toStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** 用于把公开大纲读取为会话行内的大纲 JSON。 */
export function readOutline(outline: unknown): TutorialOutline | null {
  return (outline as TutorialOutline | null) ?? null;
}

/** 用于按章节行计算书架进度计数（可读章节计入完成）。 */
export function toProgress(
  chapters: readonly ChapterRowForProjection[],
): TutorialProgressView | null {
  if (chapters.length === 0) return null;
  return {
    completed: chapters.filter((row) => row.status === 'completed' || row.status === 'warning')
      .length,
    failed: chapters.filter((row) => row.status === 'failed').length,
    total: chapters.length,
  };
}

/** 用于挑选继续阅读定位：优先可读章节，其次首个占位文档，无文档时为空。 */
export function pickContinueTarget(
  chapters: readonly ChapterRowForProjection[],
  knowledgeBaseId: string | null,
): TutorialContinueTarget | null {
  if (knowledgeBaseId === null) return null;
  const readable = chapters.find(
    (row) => (row.status === 'completed' || row.status === 'warning') && row.document_id !== null,
  );
  const fallback = chapters.find((row) => row.document_id !== null);
  const target = readable ?? fallback;
  if (target === undefined) return null;
  return {
    chapterTitle: target.title,
    documentId: target.document_id!,
    knowledgeBaseId,
  };
}

/** 用于挑选知识脊线当前章节：首个未完成章节，全部终态时为最后一章。 */
export function pickCurrentChapterId(
  chapters: readonly { id: string; status: string }[],
): string | null {
  if (chapters.length === 0) return null;
  const active = chapters.find((row) => ['placeholder', 'queued', 'running'].includes(row.status));
  return (active ?? chapters.at(-1))!.id;
}

/** 用于把会话状态合成为异步阶段计数投影，非运行期为空。 */
export function buildStageView(
  status: string,
  chapters: readonly ChapterRowForProjection[],
): TutorialStageView | null {
  if (status === 'researching') {
    return { completed: null, phase: 'researching', sourcesGathered: null, total: null };
  }
  if (status !== 'generating') return null;
  return {
    completed: chapters.filter((row) => row.status === 'completed' || row.status === 'warning')
      .length,
    phase: 'generating',
    sourcesGathered: null,
    total: chapters.length,
  };
}

/** 用于把会话行与章节行组装为书架列表项。 */
export function toSummary(
  session: SessionRowForProjection,
  chapters: readonly ChapterRowForProjection[],
  knowledgeBaseKind: string | null,
): TutorialSummary {
  return {
    continueTo: pickContinueTarget(chapters, session.tutorial_kb_id),
    createdAt: session.created_at.toISOString(),
    id: session.id,
    knowledgeBase:
      session.tutorial_kb_id !== null && knowledgeBaseKind !== null
        ? { id: session.tutorial_kb_id, kind: knowledgeBaseKind }
        : null,
    progress: toProgress(chapters),
    status: session.status,
    topic: session.topic,
    updatedAt: session.updated_at.toISOString(),
  };
}

/** 用于按详情输入合成完整详情投影。 */
export function toDetail(input: {
  chapters: readonly TutorialChapterView[];
  currentChapterId: string | null;
  errorCode: string | null;
  id: string;
  knowledgeBase: TutorialDetail['knowledgeBase'];
  outline: TutorialOutline | null;
  scope: TutorialDetail['scope'];
  stage: TutorialStageView | null;
  status: string;
  tutorialKnowledgeBaseId: string | null;
  warnings: readonly string[];
}): TutorialDetail {
  const knowledgeBaseId = input.tutorialKnowledgeBaseId;
  return {
    chapters: input.chapters,
    continueTo: pickContinueTarget(
      input.chapters.map((chapter) => ({
        document_id: chapter.documentId,
        id: chapter.id,
        node_key: chapter.nodeKey,
        status: chapter.status,
        title: chapter.title,
      })),
      input.tutorialKnowledgeBaseId,
    ),
    currentChapterId: input.currentChapterId,
    errorCode: input.errorCode,
    id: input.id,
    knowledgeBase: input.knowledgeBase,
    outline: input.outline,
    scope: input.scope,
    stage: input.stage,
    status: input.status,
    tutorialKnowledgeBaseId: knowledgeBaseId,
    warnings: input.warnings,
  };
}
