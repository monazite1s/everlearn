/**
 * @fileoverview 请求教程 API 并收窄为本 feature 的局部投影。
 */
// 契约暂由本文件局部声明，待后端定稿后并入 packages/contracts，禁止在并入前被其他 feature 复用。

import { isRecord, requestApi, type ApiResult } from '../../shared/api-request';

/** 教程章节完成计数的局部投影。 */
export interface TutorialChapterCounts {
  readonly failed: number;
  readonly pending: number;
  readonly succeeded: number;
  readonly total: number;
}

/** 教程列表条目的局部投影。 */
export interface TutorialListItem {
  readonly chapterCounts: TutorialChapterCounts | null;
  readonly createdAt: string;
  readonly id: string;
  readonly status: string;
  readonly topic: string;
}

/** 教程范围的局部投影。 */
export interface TutorialScope {
  readonly audience: string;
  readonly depth: 'deep' | 'overview' | 'standard';
  readonly excludeTopics: readonly string[];
  readonly goals: string;
  readonly includeTopics: readonly string[];
  readonly knowledgeBaseIds: readonly string[];
  readonly level: string;
  readonly topic: string;
}

/** 大纲章节的局部投影。 */
export interface TutorialOutlineChapter {
  readonly dependsOn: readonly string[];
  readonly nodeKey: string;
  readonly summary: string;
  readonly title: string;
}

/** 教程章节的局部投影。 */
export interface TutorialChapter {
  readonly attempt: number;
  readonly dependsOn: readonly string[];
  readonly documentId: string | null;
  readonly errorCode: string | null;
  readonly id: string;
  readonly nodeKey: string;
  readonly status: string;
  readonly title: string;
}

/** 教程详情的局部投影。 */
export interface TutorialDetail {
  readonly chapters: readonly TutorialChapter[];
  readonly errorCode: string | null;
  readonly id: string;
  readonly outline: { readonly chapters: readonly TutorialOutlineChapter[] } | null;
  readonly scope: TutorialScope | null;
  readonly status: string;
  readonly tutorialKnowledgeBaseId: string | null;
  readonly warnings: readonly string[];
}

const KNOWN_CODES = [
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'TUTORIAL_STATE_CONFLICT',
] as const;
export type TutorialApiErrorCode = (typeof KNOWN_CODES)[number];

const DEPTHS = ['overview', 'standard', 'deep'] as const;

/** 用于只读取字符串数组且容忍缺省。 */
function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** 用于只读取字符串或 null 字段。 */
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** 用于收窄章节完成计数。 */
function parseChapterCounts(value: unknown): TutorialChapterCounts | null {
  if (!isRecord(value)) return null;
  const numbers = [value.failed, value.pending, value.succeeded, value.total];
  if (numbers.some((item) => typeof item !== 'number')) return null;
  return {
    failed: value.failed as number,
    pending: value.pending as number,
    succeeded: value.succeeded as number,
    total: value.total as number,
  };
}

/** 用于把未知响应收窄为教程列表投影。 */
export function parseTutorialList(value: unknown): TutorialListItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: TutorialListItem[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string' || typeof entry.topic !== 'string')
      return undefined;
    items.push({
      chapterCounts: parseChapterCounts(entry.chapterCounts),
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
      id: entry.id,
      status: typeof entry.status === 'string' ? entry.status : '',
      topic: entry.topic,
    });
  }
  return items;
}

/** 用于收窄教程范围。 */
function parseScope(value: unknown): TutorialScope | null {
  if (!isRecord(value) || typeof value.topic !== 'string') return null;
  const depth = DEPTHS.includes(value.depth as (typeof DEPTHS)[number])
    ? (value.depth as TutorialScope['depth'])
    : 'standard';
  return {
    audience: typeof value.audience === 'string' ? value.audience : '',
    depth,
    excludeTopics: stringList(value.excludeTopics),
    goals: typeof value.goals === 'string' ? value.goals : '',
    includeTopics: stringList(value.includeTopics),
    knowledgeBaseIds: stringList(value.knowledgeBaseIds),
    level: typeof value.level === 'string' ? value.level : '',
    topic: value.topic,
  };
}

/** 用于收窄大纲章节列表。 */
function parseOutlineChapters(value: unknown): TutorialOutlineChapter[] {
  if (!Array.isArray(value)) return [];
  const chapters: TutorialOutlineChapter[] = [];
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      typeof entry.nodeKey !== 'string' ||
      typeof entry.title !== 'string' ||
      typeof entry.summary !== 'string'
    )
      continue;
    chapters.push({
      dependsOn: stringList(entry.dependsOn),
      nodeKey: entry.nodeKey,
      summary: entry.summary,
      title: entry.title,
    });
  }
  return chapters;
}

/** 用于收窄章节列表。 */
function parseChapters(value: unknown): TutorialChapter[] {
  if (!Array.isArray(value)) return [];
  const chapters: TutorialChapter[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string') continue;
    chapters.push({
      attempt: typeof entry.attempt === 'number' ? entry.attempt : 0,
      dependsOn: stringList(entry.dependsOn),
      documentId: stringOrNull(entry.documentId),
      errorCode: stringOrNull(entry.errorCode),
      id: entry.id,
      nodeKey: typeof entry.nodeKey === 'string' ? entry.nodeKey : '',
      status: typeof entry.status === 'string' ? entry.status : '',
      title: typeof entry.title === 'string' ? entry.title : '',
    });
  }
  return chapters;
}

/** 用于把未知响应收窄为教程详情投影。 */
export function parseTutorialDetail(value: unknown): TutorialDetail | undefined {
  if (!isRecord(value) || typeof value.id !== 'string') return undefined;
  const outline = isRecord(value.outline)
    ? { chapters: parseOutlineChapters(value.outline.chapters) }
    : null;
  return {
    chapters: parseChapters(value.chapters),
    errorCode: stringOrNull(value.errorCode),
    id: value.id,
    outline,
    scope: parseScope(value.scope),
    status: typeof value.status === 'string' ? value.status : '',
    tutorialKnowledgeBaseId: stringOrNull(value.tutorialKnowledgeBaseId),
    warnings: stringList(value.warnings),
  };
}

/** 创建教程的请求载荷。 */
export interface CreateTutorialInput {
  readonly audience: string;
  readonly depth: TutorialScope['depth'];
  readonly excludeTopics: string[];
  readonly goals: string;
  readonly includeTopics: string[];
  readonly knowledgeBaseIds: string[];
  readonly level: string;
  readonly topic: string;
}

const JSON_INIT = { headers: { 'content-type': 'application/json' } };

/** 用于创建教程草稿。 */
export function createTutorial(
  input: CreateTutorialInput,
): Promise<ApiResult<{ id: string }, TutorialApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 201,
    init: { ...JSON_INIT, body: JSON.stringify(input), method: 'POST' },
    networkMessage: '无法创建教程，请稍后重试。',
    /** 用于收窄创建结果中的教程标识。 */
    parse: (value) =>
      isRecord(value) && typeof value.id === 'string' ? { id: value.id } : undefined,
    url: '/api/v1/tutorials',
  });
}

/** 用于列出教程。 */
export function listTutorials(): Promise<ApiResult<TutorialListItem[], TutorialApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    networkMessage: '无法读取教程列表，请稍后重试。',
    parse: parseTutorialList,
    url: '/api/v1/tutorials',
  });
}

/** 用于读取教程详情。 */
export function getTutorial(id: string): Promise<ApiResult<TutorialDetail, TutorialApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    networkMessage: '无法读取教程详情，请稍后重试。',
    parse: parseTutorialDetail,
    url: `/api/v1/tutorials/${id}`,
  });
}

/** 用于保存草稿范围。 */
export function updateTutorialScope(
  id: string,
  scope: CreateTutorialInput,
): Promise<ApiResult<unknown, TutorialApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    init: { ...JSON_INIT, body: JSON.stringify(scope), method: 'PUT' },
    networkMessage: '无法保存教程范围，请稍后重试。',
    /** 用于忽略保存范围响应的无正文结果。 */
    parse: () => ({}),
    url: `/api/v1/tutorials/${id}/scope`,
  });
}

/** 用于确认范围并启动研究。 */
export function confirmTutorialScope(
  id: string,
): Promise<ApiResult<unknown, TutorialApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    init: { ...JSON_INIT, method: 'POST' },
    networkMessage: '无法启动研究，请稍后重试。',
    /** 用于忽略确认范围响应的无正文结果。 */
    parse: () => ({}),
    url: `/api/v1/tutorials/${id}/confirm-scope`,
  });
}

/** 用于保存大纲编辑。 */
export function updateTutorialOutline(
  id: string,
  chapters: TutorialOutlineChapter[],
): Promise<ApiResult<unknown, TutorialApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    init: { ...JSON_INIT, body: JSON.stringify({ chapters }), method: 'PUT' },
    networkMessage: '无法保存大纲，请稍后重试。',
    /** 用于忽略保存大纲响应的无正文结果。 */
    parse: () => ({}),
    url: `/api/v1/tutorials/${id}/outline`,
  });
}

/** 用于确认大纲并创建教程知识库。 */
export function confirmTutorialOutline(
  id: string,
): Promise<ApiResult<unknown, TutorialApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    init: { ...JSON_INIT, method: 'POST' },
    networkMessage: '无法确认大纲，请稍后重试。',
    /** 用于忽略确认大纲响应的无正文结果。 */
    parse: () => ({}),
    url: `/api/v1/tutorials/${id}/confirm-outline`,
  });
}

/** 用于重试失败或已取消的单章。 */
export function retryTutorialChapter(
  id: string,
  chapterId: string,
): Promise<ApiResult<unknown, TutorialApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    init: { ...JSON_INIT, method: 'POST' },
    networkMessage: '无法重试该章节，请稍后重试。',
    /** 用于忽略章节重试响应的无正文结果。 */
    parse: () => ({}),
    url: `/api/v1/tutorials/${id}/chapters/${chapterId}/retry`,
  });
}

/** 用于取消剩余章节生成。 */
export function cancelTutorial(id: string): Promise<ApiResult<unknown, TutorialApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    init: { ...JSON_INIT, method: 'POST' },
    networkMessage: '无法取消章节生成，请稍后重试。',
    /** 用于忽略取消响应的无正文结果。 */
    parse: () => ({}),
    url: `/api/v1/tutorials/${id}/cancel`,
  });
}

/** 教程整体错误码的中文文案映射。 */
const TUTORIAL_ERROR_LABELS: Record<string, string> = {
  INTERNAL_ERROR: '服务内部错误，请稍后重试。',
  NOT_FOUND: '教程不存在，可能已被删除。',
  RESEARCH_FAILED: '研究阶段失败，请调整范围后重试。',
  TUTORIAL_INVALID_TRANSITION: '教程状态已变化，请刷新页面后再操作。',
  TUTORIAL_OUTLINE_INVALID: '大纲结构无效，请检查章节依赖后重试。',
  TUTORIAL_RUN_NOT_ACTIVE: '当前没有可重试的失败章节。',
  VALIDATION_FAILED: '提交内容未通过校验，请检查后重试。',
};

/** 用于把教程整体错误码转换为中文文案与修改建议。 */
export function describeTutorialErrorCode(code: string): string {
  return TUTORIAL_ERROR_LABELS[code] ?? `操作失败（${code}），请刷新后重试。`;
}

/** 章节错误码的中文文案映射。 */
const CHAPTER_ERROR_LABELS: Record<string, string> = {
  CHAPTER_GENERATION_FAILED: '章节生成失败，可重试本章。',
  INTERNAL_ERROR: '服务内部错误，可重试本章。',
  NOT_FOUND: '章节不存在，请刷新页面。',
};

/** 用于把章节错误码转换为中文文案。 */
export function describeChapterErrorCode(code: string): string {
  return CHAPTER_ERROR_LABELS[code] ?? `本章失败（${code}），可重试。`;
}
