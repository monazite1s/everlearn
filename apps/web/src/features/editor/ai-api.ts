/** @fileoverview 接入 AI 问答与草稿生成端点；契约暂由本文件局部手写，待并入 packages/contracts。 */

import {
  hasExactKeys,
  isRecord,
  requestApi,
  type ApiFailureEnvelope,
  type ApiResult,
} from '../../shared/api-request';
import { ssePost, type SsePostOutcome } from '../../shared/sse-post';

/** 知识库问答的公开响应投影。 */
export interface AiQaAnswer {
  readonly answer: string;
  readonly citations: readonly { readonly blockId: string; readonly documentId: string }[];
  readonly candidateCount: number;
  /** 本次问答使用的检索模式，旧版后端可能缺省。 */
  readonly retrievalMode?: 'fts' | 'hybrid' | undefined;
}

/** 草稿生成 SSE 单帧投影。 */
export interface AiDraftFrame {
  readonly delta: string;
  readonly done: boolean;
  readonly error?: string;
  readonly seq: number;
}

/** 本功能需要识别的稳定错误码闭集。 */
export type AiErrorCode =
  | 'BAD_REQUEST'
  | 'INTERNAL_ERROR'
  | 'LLM_INVALID_OUTPUT'
  | 'LLM_NETWORK_ERROR'
  | 'LLM_NOT_CONFIGURED'
  | 'LLM_TIMEOUT'
  | 'LLM_UPSTREAM_ERROR'
  | 'NOT_FOUND'
  | 'VALIDATION_FAILED';

export type AiApiFailure = ApiFailureEnvelope<AiErrorCode>;

const AI_PATH = '/api/v1/ai';
const ERROR_CODES: readonly AiErrorCode[] = [
  'BAD_REQUEST',
  'INTERNAL_ERROR',
  'LLM_INVALID_OUTPUT',
  'LLM_NETWORK_ERROR',
  'LLM_NOT_CONFIGURED',
  'LLM_TIMEOUT',
  'LLM_UPSTREAM_ERROR',
  'NOT_FOUND',
  'VALIDATION_FAILED',
];

/** 错误码到可行动中文文案的映射。 */
const ERROR_MESSAGES: Record<AiErrorCode, string> = {
  BAD_REQUEST: '请求格式不正确，请调整后重试。',
  INTERNAL_ERROR: '服务暂时不可用，请稍后重试。',
  LLM_INVALID_OUTPUT: '模型输出异常，请重试。',
  LLM_NETWORK_ERROR: '无法连接模型服务，请检查网络后重试。',
  LLM_NOT_CONFIGURED: '模型服务未配置，请联系管理员配置 LLM 后使用。',
  LLM_TIMEOUT: '模型请求超时，请稍后重试。',
  LLM_UPSTREAM_ERROR: '模型服务异常，请稍后重试。',
  NOT_FOUND: '知识库不存在或不可访问。',
  VALIDATION_FAILED: '输入内容超出长度限制，请缩短后重试。',
};

/** 用于把稳定错误码映射为可行动中文文案。 */
export function aiErrorMessage(code: string | undefined): string {
  const known = ERROR_CODES.find((item) => item === code);
  return known ? ERROR_MESSAGES[known] : '生成失败，请稍后重试。';
}

/** 用于校验问答响应的字段全集与形态，允许新版后端附带 retrievalMode。 */
function parseQaAnswer(value: unknown): AiQaAnswer | undefined {
  if (!isRecord(value)) return undefined;
  const baseKeys = ['answer', 'candidateCount', 'citations'];
  const withModeKeys = [...baseKeys, 'retrievalMode'];
  if (!hasExactKeys(value, baseKeys) && !hasExactKeys(value, withModeKeys)) return undefined;
  if (typeof value.answer !== 'string' || typeof value.candidateCount !== 'number')
    return undefined;
  if (!Array.isArray(value.citations)) return undefined;
  const retrievalMode =
    value.retrievalMode === 'fts' || value.retrievalMode === 'hybrid'
      ? value.retrievalMode
      : undefined;
  const citations = value.citations.flatMap((item) => {
    if (!isRecord(item)) return [];
    return typeof item.blockId === 'string' && typeof item.documentId === 'string'
      ? [{ blockId: item.blockId, documentId: item.documentId }]
      : [];
  });
  return {
    answer: value.answer,
    citations,
    candidateCount: value.candidateCount,
    ...(retrievalMode ? { retrievalMode } : {}),
  };
}

/** 用于发起一次知识库问答并返回校验后的答案。 */
export function requestAiQa(
  knowledgeBaseId: string,
  question: string,
): Promise<ApiResult<AiQaAnswer, AiErrorCode>> {
  return requestApi<AiQaAnswer, AiErrorCode>({
    codes: ERROR_CODES,
    expectedStatus: 201,
    init: {
      body: JSON.stringify({ knowledgeBaseId, question }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
    networkMessage: '无法连接问答服务，请检查网络后重试。',
    parse: parseQaAnswer,
    url: `${AI_PATH}/qa`,
  });
}

/** 用于流式接收草稿增量，帧数据原样透传给回调。 */
export function streamAiDraft(
  documentId: string,
  instruction: string,
  onEvent: (frame: AiDraftFrame) => void,
  signal: AbortSignal,
): Promise<SsePostOutcome> {
  return ssePost<AiDraftFrame>({
    body: { documentId, instruction },
    onEvent,
    signal,
    url: `${AI_PATH}/generate-draft`,
  });
}
