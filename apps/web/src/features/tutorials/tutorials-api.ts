/**
 * @fileoverview 请求教程 API 端点，契约路径以 api-and-events.md 为准。
 */
// 契约暂由 tutorials-contract.ts 局部声明，待后端定稿后并入 packages/contracts。

import { isRecord, requestApi } from '../../shared/api-request';
import type { ApiResult } from '../../shared/api-request';
import type { ComposeSnapshot, TutorialDetail, TutorialListItem } from './tutorials-contract';
import { parseComposeSnapshot, parseTutorialDetail, parseTutorialList } from './tutorials-contract';

const KNOWN_CODES = [
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'TUTORIAL_STATE_CONFLICT',
] as const;
export type TutorialApiErrorCode = (typeof KNOWN_CODES)[number];

const JSON_INIT = { headers: { 'content-type': 'application/json' } };

/** 用于创建教程的最小请求载荷，仅主题必填。 */
export interface CreateTutorialInput {
  readonly audience?: string;
  readonly depth?: string;
  readonly goals?: string;
  readonly topic: string;
}

/** 用于列出教程书架。 */
export function listTutorials(): Promise<ApiResult<TutorialListItem[], TutorialApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    networkMessage: '无法读取教程列表，请稍后重试。',
    parse: parseTutorialList,
    url: '/api/v1/tutorials',
  });
}

/** 用于以最小字段创建 draft_scope 教程草案。 */
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

/** 用于读取教程详情（三视图共用的章节数据源）。 */
export function getTutorial(id: string): Promise<ApiResult<TutorialDetail, TutorialApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    networkMessage: '无法读取教程详情，请稍后重试。',
    parse: parseTutorialDetail,
    url: `/api/v1/tutorials/${id}`,
  });
}

/** 用于读取 compose 会话快照。 */
export function getComposeSnapshot(
  id: string,
): Promise<ApiResult<ComposeSnapshot, TutorialApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    networkMessage: '无法读取创作会话，请稍后重试。',
    parse: parseComposeSnapshot,
    url: `/api/v1/tutorials/${id}/compose`,
  });
}

/** 用于以幂等键同步发送用户消息并返回 Agent 回复。 */
export function sendComposeMessage(
  id: string,
  content: string,
  idempotencyKey: string,
): Promise<ApiResult<unknown, TutorialApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    init: {
      body: JSON.stringify({ content }),
      headers: { ...JSON_INIT.headers, 'idempotency-key': idempotencyKey },
      method: 'POST',
    },
    networkMessage: '消息发送失败，请检查网络后重试。',
    /** 用于忽略无业务正文的响应。 */
    parse: () => ({}),
    url: `/api/v1/tutorials/${id}/compose/messages`,
  });
}

/** 用于决议提案；重复决议由服务端返回首次结果。 */
export function decideProposal(
  tutorialId: string,
  proposalId: string,
  decision: 'accept' | 'reject',
): Promise<ApiResult<unknown, TutorialApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    init: { ...JSON_INIT, method: 'POST' },
    networkMessage: '无法记录提案决议，请稍后重试。',
    /** 用于忽略无业务正文的响应。 */
    parse: () => ({}),
    url: `/api/v1/tutorials/${tutorialId}/compose/proposals/${proposalId}/${decision}`,
  });
}

/** 用于确认研究范围闸门，确认后固化不可变研究范围。 */
export function confirmTutorialScope(
  id: string,
): Promise<ApiResult<unknown, TutorialApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    init: { ...JSON_INIT, method: 'POST' },
    networkMessage: '无法开始研究，请稍后重试。',
    /** 用于忽略无业务正文的响应。 */
    parse: () => ({}),
    url: `/api/v1/tutorials/${id}/confirm-scope`,
  });
}

/** 用于确认大纲闸门，确认后原子创建教程知识库与章节占位文档。 */
export function confirmTutorialOutline(
  id: string,
): Promise<ApiResult<unknown, TutorialApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    init: { ...JSON_INIT, method: 'POST' },
    networkMessage: '无法确认大纲，请稍后重试。',
    /** 用于忽略无业务正文的响应。 */
    parse: () => ({}),
    url: `/api/v1/tutorials/${id}/confirm-outline`,
  });
}

/** 用于接受章节改写差异，重复接受返回同一修订。 */
export function acceptGenerationDiff(
  generationId: string,
): Promise<ApiResult<unknown, TutorialApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    init: { ...JSON_INIT, method: 'POST' },
    networkMessage: '无法接受差异，请稍后重试。',
    /** 用于忽略无业务正文的响应。 */
    parse: () => ({}),
    url: `/api/v1/generations/${generationId}/accept`,
  });
}

/** 用于单章重试，服务端沿用幂等键并写入新修订。 */
export function retryTutorialChapter(
  chapterId: string,
): Promise<ApiResult<unknown, TutorialApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    init: { ...JSON_INIT, method: 'POST' },
    networkMessage: '无法重试该章节，请稍后重试。',
    /** 用于忽略无业务正文的响应。 */
    parse: () => ({}),
    url: `/api/v1/tutorial-chapters/${chapterId}/retry`,
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
