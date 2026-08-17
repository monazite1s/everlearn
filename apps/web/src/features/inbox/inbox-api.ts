/** @fileoverview 将 Inbox 页面接入同源 API 并校验公开响应。 */

import type {
  ConvertInboxItemRequest,
  CreateInboxItemRequest,
  DocumentDetail,
  InboxItemErrorCode,
  InboxItemListResponse,
  InboxItemSummary,
} from '@everlearn/contracts';

import { parseDocumentDetail } from '../knowledge/document-api';

export interface InboxApiFailure {
  readonly certainty: 'known' | 'unknown';
  readonly code?: InboxItemErrorCode;
  readonly message: string;
  readonly requestId?: string;
}

export type InboxApiResult<T> =
  { readonly data: T; readonly ok: true } | { readonly error: InboxApiFailure; readonly ok: false };

const API_PATH = '/api/v1/inbox-items';
const SUMMARY_KEYS = ['content', 'createdAt', 'id', 'kind'] as const;
const ERROR_CODES: readonly InboxItemErrorCode[] = [
  'BAD_REQUEST',
  'IDEMPOTENCY_CONFLICT',
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'UNSUPPORTED_MEDIA_TYPE',
  'VALIDATION_FAILED',
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

/** 用于收窄封闭记录类型且不静默接受未知值。 */
function isInboxItemKind(value: unknown): value is InboxItemSummary['kind'] {
  return value === 'text' || value === 'url';
}

/** 用于在公开摘要进入页面状态前完成校验。 */
function isInboxItemSummary(value: unknown): value is InboxItemSummary {
  if (!isRecord(value) || !hasExactKeys(value, SUMMARY_KEYS)) return false;
  return (
    typeof value.content === 'string' &&
    typeof value.createdAt === 'string' &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    typeof value.id === 'string' &&
    isInboxItemKind(value.kind)
  );
}

/** 用于解析不可信列表投影并保持共享契约类型。 */
function parseInboxItemList(value: unknown): InboxItemListResponse | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['items', 'nextCursor'])) return undefined;
  if (!Array.isArray(value.items) || !value.items.every(isInboxItemSummary)) return undefined;
  if (value.nextCursor !== null && typeof value.nextCursor !== 'string') return undefined;
  return { items: value.items, nextCursor: value.nextCursor };
}

/** 用于返回已校验且不扩宽结构的 Inbox 摘要。 */
function parseInboxItemSummary(value: unknown): InboxItemSummary | undefined {
  return isInboxItemSummary(value) ? value : undefined;
}

/** 用于将服务端错误码收窄到稳定 Inbox 契约。 */
function isInboxItemErrorCode(value: unknown): value is InboxItemErrorCode {
  return typeof value === 'string' && ERROR_CODES.includes(value as InboxItemErrorCode);
}

/** 用于只读取服务端错误信封中稳定且用户安全的部分。 */
function parseFailure(value: unknown, certainty: InboxApiFailure['certainty']): InboxApiFailure {
  if (!isRecord(value) || typeof value.message !== 'string') {
    return { certainty, message: '服务返回了无法识别的结果，请稍后重试。' };
  }
  const code = isInboxItemErrorCode(value.code) ? value.code : undefined;
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
async function requestInbox<T>(
  url: string,
  expectedStatus: number,
  parse: (value: unknown) => T | undefined,
  init?: RequestInit,
): Promise<InboxApiResult<T>> {
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
      error: { certainty: 'unknown', message: '无法连接 Inbox 服务，请检查网络后重试。' },
      ok: false,
    };
  }
}

/** 用于读取按创建时间倒序的一页待处理记录。 */
export function listInboxItems(cursor?: string): Promise<InboxApiResult<InboxItemListResponse>> {
  const query = new URLSearchParams({ limit: '20' });
  if (cursor) query.set('cursor', cursor);
  return requestInbox(`${API_PATH}?${query.toString()}`, 200, parseInboxItemList);
}

/** 用于创建纯文本或链接记录且不接受所有权字段。 */
export function createInboxItem(
  request: CreateInboxItemRequest,
): Promise<InboxApiResult<InboxItemSummary>> {
  return requestInbox(API_PATH, 201, parseInboxItemSummary, {
    body: JSON.stringify(request),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

/** 用于按幂等键把待处理记录转换为普通文档并校验详情。 */
export function convertInboxItem(
  id: string,
  request: ConvertInboxItemRequest,
  idempotencyKey: string,
): Promise<InboxApiResult<DocumentDetail>> {
  return requestInbox(`${API_PATH}/${encodeURIComponent(id)}/convert`, 201, parseDocumentDetail, {
    body: JSON.stringify(request),
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    method: 'POST',
  });
}

/** 用于软删除一条待处理记录。 */
export async function deleteInboxItem(id: string): Promise<InboxApiResult<undefined>> {
  try {
    const response = await fetch(`${API_PATH}/${encodeURIComponent(id)}`, {
      cache: 'no-store',
      method: 'DELETE',
    });
    if (response.status === 204) return { data: undefined, ok: true };
    return { error: parseFailure(await readJson(response), 'known'), ok: false };
  } catch {
    return {
      error: { certainty: 'unknown', message: '删除结果尚未确认，请重试或重新读取列表。' },
      ok: false,
    };
  }
}
