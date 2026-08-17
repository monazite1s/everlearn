/** @fileoverview 将知识库页面接入同源 API 并校验公开响应。 */

import type {
  CreateKnowledgeBaseRequest,
  KnowledgeBaseErrorCode,
  KnowledgeBaseListResponse,
  KnowledgeBaseSummary,
  KnowledgeBaseVersionRequest,
  UpdateKnowledgeBaseRequest,
} from '@everlearn/contracts';

export interface KnowledgeApiFailure {
  readonly certainty: 'known' | 'unknown';
  readonly code?: KnowledgeBaseErrorCode;
  readonly message: string;
  readonly requestId?: string;
}

export type KnowledgeApiResult<T> =
  | { readonly data: T; readonly ok: true }
  | { readonly error: KnowledgeApiFailure; readonly ok: false };

const API_PATH = '/api/v1/knowledge-bases';
const SUMMARY_KEYS = [
  'description',
  'documentCount',
  'id',
  'kind',
  'name',
  'updatedAt',
  'version',
] as const;
const ERROR_CODES: readonly KnowledgeBaseErrorCode[] = [
  'BAD_REQUEST',
  'CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'UNSUPPORTED_MEDIA_TYPE',
  'VALIDATION_FAILED',
  'VERSION_CONFLICT',
];

/** 用于将不可信 JSON 收窄为非数组记录。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 用于验证响应对象只包含批准的公开字段。 */
function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && expected.every((key) => actual.includes(key));
}

/** 用于收窄封闭知识库类型且不静默接受未知值。 */
function isKnowledgeBaseKind(value: unknown): value is KnowledgeBaseSummary['kind'] {
  return value === 'news' || value === 'normal' || value === 'tutorial';
}

/** 用于校验序列化为安全非负整数的数值字段。 */
function isSafeIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

/** 用于在公开摘要进入页面状态前完成校验。 */
function isKnowledgeBaseSummary(value: unknown): value is KnowledgeBaseSummary {
  if (!isRecord(value) || !hasExactKeys(value, SUMMARY_KEYS)) return false;
  return (
    typeof value.description === 'string' &&
    isSafeIntegerAtLeast(value.documentCount, 0) &&
    typeof value.id === 'string' &&
    isKnowledgeBaseKind(value.kind) &&
    typeof value.name === 'string' &&
    typeof value.updatedAt === 'string' &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    isSafeIntegerAtLeast(value.version, 1)
  );
}

/** 用于解析不可信列表投影并保持共享契约类型。 */
function parseKnowledgeBaseList(value: unknown): KnowledgeBaseListResponse | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['items', 'nextCursor'])) return undefined;
  if (!Array.isArray(value.items) || !value.items.every(isKnowledgeBaseSummary)) return undefined;
  if (value.nextCursor !== null && typeof value.nextCursor !== 'string') return undefined;
  return { items: value.items, nextCursor: value.nextCursor };
}

/** 用于返回已校验且不扩宽结构的知识库摘要。 */
function parseKnowledgeBaseSummary(value: unknown): KnowledgeBaseSummary | undefined {
  return isKnowledgeBaseSummary(value) ? value : undefined;
}

/** 用于将服务端错误码收窄到稳定知识库契约。 */
function isKnowledgeBaseErrorCode(value: unknown): value is KnowledgeBaseErrorCode {
  return typeof value === 'string' && ERROR_CODES.includes(value as KnowledgeBaseErrorCode);
}

/** 用于只读取服务端错误信封中稳定且用户安全的部分。 */
function parseFailure(
  value: unknown,
  certainty: KnowledgeApiFailure['certainty'],
): KnowledgeApiFailure {
  if (!isRecord(value) || typeof value.message !== 'string') {
    return { certainty, message: '服务返回了无法识别的结果，请稍后重试。' };
  }
  const code = isKnowledgeBaseErrorCode(value.code) ? value.code : undefined;
  const requestId = typeof value.requestId === 'string' ? value.requestId : undefined;
  return {
    certainty,
    ...(code ? { code } : {}),
    message: value.message,
    ...(requestId ? { requestId } : {}),
  };
}

/** 用于安全解码 JSON 且不向界面暴露传输或解析错误。 */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** 用于执行状态检查请求并校验成功投影。 */
async function requestKnowledge<T>(
  url: string,
  expectedStatus: number,
  parse: (value: unknown) => T | undefined,
  init?: RequestInit,
): Promise<KnowledgeApiResult<T>> {
  try {
    const response = await fetch(url, { cache: 'no-store', ...init });
    const body = await readJson(response);
    if (response.status !== expectedStatus) {
      return { error: parseFailure(body, 'known'), ok: false };
    }
    const data = parse(body);
    if (data) return { data, ok: true };
    return { error: parseFailure(body, 'unknown'), ok: false };
  } catch {
    return {
      error: { certainty: 'unknown', message: '无法连接知识库服务，请检查网络后重试。' },
      ok: false,
    };
  }
}

/** 用于读取按最近知识库活动排序的一页游标结果。 */
export function listKnowledgeBases(
  cursor?: string,
): Promise<KnowledgeApiResult<KnowledgeBaseListResponse>> {
  const query = new URLSearchParams({ limit: '20' });
  if (cursor) query.set('cursor', cursor);
  return requestKnowledge(`${API_PATH}?${query.toString()}`, 200, parseKnowledgeBaseList);
}

/** 用于创建普通知识库且不接受所有权或服务端字段。 */
export function createKnowledgeBase(
  request: CreateKnowledgeBaseRequest,
): Promise<KnowledgeApiResult<KnowledgeBaseSummary>> {
  return requestKnowledge(API_PATH, 201, parseKnowledgeBaseSummary, {
    body: JSON.stringify(request),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

/** 用于读取创建后目标页可见的知识库。 */
export function getKnowledgeBase(id: string): Promise<KnowledgeApiResult<KnowledgeBaseSummary>> {
  return requestKnowledge(`${API_PATH}/${encodeURIComponent(id)}`, 200, parseKnowledgeBaseSummary);
}

/** 用于按页面最后观察版本更新可编辑元数据。 */
export function updateKnowledgeBase(
  id: string,
  request: UpdateKnowledgeBaseRequest,
): Promise<KnowledgeApiResult<KnowledgeBaseSummary>> {
  return requestKnowledge(`${API_PATH}/${encodeURIComponent(id)}`, 200, parseKnowledgeBaseSummary, {
    body: JSON.stringify(request),
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH',
  });
}

/** 用于按精确乐观版本软删除知识库。 */
export async function deleteKnowledgeBase(
  id: string,
  request: KnowledgeBaseVersionRequest,
): Promise<KnowledgeApiResult<undefined>> {
  try {
    const response = await fetch(`${API_PATH}/${encodeURIComponent(id)}`, {
      body: JSON.stringify(request),
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      method: 'DELETE',
    });
    if (response.status === 204) return { data: undefined, ok: true };
    return { error: parseFailure(await readJson(response), 'known'), ok: false };
  } catch {
    return {
      error: { certainty: 'unknown', message: '删除结果尚未确认，可以安全重试本次操作。' },
      ok: false,
    };
  }
}

/** 用于按幂等键从回收站恢复知识库。 */
export function restoreKnowledgeBase(
  id: string,
  request: KnowledgeBaseVersionRequest,
  idempotencyKey: string,
): Promise<KnowledgeApiResult<KnowledgeBaseSummary>> {
  return requestKnowledge(
    `${API_PATH}/${encodeURIComponent(id)}/restore`,
    200,
    parseKnowledgeBaseSummary,
    {
      body: JSON.stringify(request),
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      method: 'POST',
    },
  );
}
