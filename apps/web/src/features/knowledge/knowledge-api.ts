/** @fileoverview Adapts the knowledge pages to the same-origin API and validates public responses. */

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

/** Narrows an untrusted JSON value to a record without accepting arrays. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Verifies a response object contains exactly the approved public fields. */
function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && expected.every((key) => actual.includes(key));
}

/** Narrows the closed knowledge-base kind union without accepting future values silently. */
function isKnowledgeBaseKind(value: unknown): value is KnowledgeBaseSummary['kind'] {
  return value === 'news' || value === 'normal' || value === 'tutorial';
}

/** Validates numeric fields that are serialized as safe non-negative integers. */
function isSafeIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

/** Validates one public summary before it crosses into rendered page state. */
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

/** Parses an untrusted list projection while preserving the shared contract type. */
function parseKnowledgeBaseList(value: unknown): KnowledgeBaseListResponse | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['items', 'nextCursor'])) return undefined;
  if (!Array.isArray(value.items) || !value.items.every(isKnowledgeBaseSummary)) return undefined;
  if (value.nextCursor !== null && typeof value.nextCursor !== 'string') return undefined;
  return { items: value.items, nextCursor: value.nextCursor };
}

/** Returns a validated knowledge-base summary without widening its public shape. */
function parseKnowledgeBaseSummary(value: unknown): KnowledgeBaseSummary | undefined {
  return isKnowledgeBaseSummary(value) ? value : undefined;
}

/** Narrows a server error code to the stable knowledge contract. */
function isKnowledgeBaseErrorCode(value: unknown): value is KnowledgeBaseErrorCode {
  return typeof value === 'string' && ERROR_CODES.includes(value as KnowledgeBaseErrorCode);
}

/** Reads only the stable, user-safe part of a server error envelope. */
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

/** Safely decodes JSON without exposing transport or parser errors to the interface. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** Performs one status-checked request and validates its successful projection. */
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

/** Reads one cursor page ordered by recent knowledge-base activity. */
export function listKnowledgeBases(
  cursor?: string,
): Promise<KnowledgeApiResult<KnowledgeBaseListResponse>> {
  const query = new URLSearchParams({ limit: '20' });
  if (cursor) query.set('cursor', cursor);
  return requestKnowledge(`${API_PATH}?${query.toString()}`, 200, parseKnowledgeBaseList);
}

/** Creates one normal knowledge base without accepting ownership or server-managed fields. */
export function createKnowledgeBase(
  request: CreateKnowledgeBaseRequest,
): Promise<KnowledgeApiResult<KnowledgeBaseSummary>> {
  return requestKnowledge(API_PATH, 201, parseKnowledgeBaseSummary, {
    body: JSON.stringify(request),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

/** Reads one visible knowledge base for the post-create destination shell. */
export function getKnowledgeBase(id: string): Promise<KnowledgeApiResult<KnowledgeBaseSummary>> {
  return requestKnowledge(`${API_PATH}/${encodeURIComponent(id)}`, 200, parseKnowledgeBaseSummary);
}

/** Updates editable metadata using the last summary version observed by the page. */
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

/** Soft-deletes one knowledge base using an exact optimistic version. */
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
