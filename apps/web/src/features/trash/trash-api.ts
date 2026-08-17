/** @fileoverview 将回收站页面接入同源 API 并校验公开响应。 */

import type { TrashErrorCode, TrashItem, TrashListResponse } from '@everlearn/contracts';

export interface TrashApiFailure {
  readonly certainty: 'known' | 'unknown';
  readonly code?: TrashErrorCode;
  readonly message: string;
  readonly requestId?: string;
}

export type TrashApiResult<T> =
  { readonly data: T; readonly ok: true } | { readonly error: TrashApiFailure; readonly ok: false };

const API_PATH = '/api/v1/trash';
const PAGE_LIMIT = 20;
const ITEM_KEYS = [
  'deletedAt',
  'id',
  'knowledgeBaseId',
  'knowledgeBaseName',
  'objectType',
  'purgeScheduledAt',
  'title',
  'version',
] as const;
const ERROR_CODES: readonly TrashErrorCode[] = [
  'BAD_REQUEST',
  'INTERNAL_ERROR',
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

/** 用于校验序列化为安全非负整数的数值字段。 */
function isSafeIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

/** 用于校验可解析为本地展示时间的公开时间字段。 */
function isParsableDateTime(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

/** 用于收窄封闭对象类型且不静默接受未知值。 */
function isTrashObjectType(value: unknown): value is TrashItem['objectType'] {
  return value === 'document' || value === 'knowledge-base';
}

/** 用于在回收站条目进入页面状态前完成校验。 */
function isTrashItem(value: unknown): value is TrashItem {
  if (!isRecord(value) || !hasExactKeys(value, ITEM_KEYS)) return false;
  return (
    isParsableDateTime(value.deletedAt) &&
    typeof value.id === 'string' &&
    typeof value.knowledgeBaseId === 'string' &&
    typeof value.knowledgeBaseName === 'string' &&
    isTrashObjectType(value.objectType) &&
    isParsableDateTime(value.purgeScheduledAt) &&
    typeof value.title === 'string' &&
    isSafeIntegerAtLeast(value.version, 1)
  );
}

/** 用于解析不可信列表投影并保持共享契约类型。 */
function parseTrashList(value: unknown): TrashListResponse | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['items', 'nextCursor'])) return undefined;
  if (!Array.isArray(value.items) || !value.items.every(isTrashItem)) return undefined;
  if (value.nextCursor !== null && typeof value.nextCursor !== 'string') return undefined;
  return { items: value.items, nextCursor: value.nextCursor };
}

/** 用于将服务端错误码收窄到稳定回收站契约。 */
function isTrashErrorCode(value: unknown): value is TrashErrorCode {
  return typeof value === 'string' && ERROR_CODES.includes(value as TrashErrorCode);
}

/** 用于只读取服务端错误信封中稳定且用户安全的部分。 */
function parseFailure(value: unknown, certainty: TrashApiFailure['certainty']): TrashApiFailure {
  if (!isRecord(value) || typeof value.message !== 'string') {
    return { certainty, message: '服务返回了无法识别的结果，请稍后重试。' };
  }
  const code = isTrashErrorCode(value.code) ? value.code : undefined;
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

/** 用于读取按删除时间倒序的一页回收站条目。 */
export async function listTrash(cursor?: string): Promise<TrashApiResult<TrashListResponse>> {
  const query = new URLSearchParams({ limit: String(PAGE_LIMIT) });
  if (cursor) query.set('cursor', cursor);
  try {
    const response = await fetch(`${API_PATH}?${query.toString()}`, { cache: 'no-store' });
    const body = await readJson(response);
    if (response.status !== 200) {
      return { error: parseFailure(body, 'known'), ok: false };
    }
    const data = parseTrashList(body);
    if (data) return { data, ok: true };
    return { error: parseFailure(body, 'unknown'), ok: false };
  } catch {
    return {
      error: { certainty: 'unknown', message: '无法连接回收站服务，请检查网络后重试。' },
      ok: false,
    };
  }
}
