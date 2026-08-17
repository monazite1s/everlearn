/** @fileoverview 将编辑器正文读取与保存接入同源 API 并校验公开响应。 */

import type {
  DocumentContentDetail,
  DocumentErrorCode,
  SaveDocumentContentRequest,
} from '@everlearn/contracts';

export interface EditorApiFailure {
  readonly certainty: 'known' | 'unknown';
  readonly code?: DocumentErrorCode;
  readonly message: string;
  readonly requestId?: string;
}

export type EditorApiResult<T> =
  | { readonly data: T; readonly ok: true }
  | { readonly error: EditorApiFailure; readonly ok: false };

const DOCUMENT_PATH = '/api/v1/documents';
const TREE_ITEM_KEYS = ['childCount', 'id', 'title', 'updatedAt', 'version'] as const;
const CONTENT_DETAIL_KEYS = [
  ...TREE_ITEM_KEYS,
  'contentJson',
  'knowledgeBaseId',
  'parentId',
  'schemaVersion',
] as const;
const ERROR_CODES: readonly DocumentErrorCode[] = [
  'BAD_REQUEST',
  'CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'INTERNAL_ERROR',
  'KNOWLEDGE_BASE_DELETED',
  'NOT_FOUND',
  'UNPROCESSABLE_ENTITY',
  'UNSUPPORTED_MEDIA_TYPE',
  'VALIDATION_FAILED',
  'VERSION_CONFLICT',
];

export interface EditorApiFailure {
  readonly certainty: 'known' | 'unknown';
  readonly code?: DocumentErrorCode;
  readonly message: string;
  readonly requestId?: string;
}

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

/** 用于校验内容投影与详情共享的公开标量字段。 */
function hasContentDetailFields(value: Record<string, unknown>): boolean {
  return (
    isSafeIntegerAtLeast(value.childCount, 0) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.updatedAt === 'string' &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    isSafeIntegerAtLeast(value.version, 1) &&
    typeof value.knowledgeBaseId === 'string' &&
    (typeof value.parentId === 'string' || value.parentId === null)
  );
}

/** 用于校验正文内容投影的字段全集与正文形态。 */
function isDocumentContentDetail(value: unknown): value is DocumentContentDetail {
  if (!isRecord(value) || !hasExactKeys(value, CONTENT_DETAIL_KEYS)) return false;
  return (
    hasContentDetailFields(value) &&
    isRecord(value.contentJson) &&
    isSafeIntegerAtLeast(value.schemaVersion, 1)
  );
}

/** 用于将服务端错误码收窄到稳定文档契约。 */
function isDocumentErrorCode(value: unknown): value is DocumentErrorCode {
  return typeof value === 'string' && ERROR_CODES.includes(value as DocumentErrorCode);
}

/** 用于只读取服务端错误信封中稳定且用户安全的部分。 */
function parseFailure(value: unknown, certainty: EditorApiFailure['certainty']): EditorApiFailure {
  if (!isRecord(value) || typeof value.message !== 'string') {
    return { certainty, message: '服务返回了无法识别的结果，请稍后重试。' };
  }
  const code = isDocumentErrorCode(value.code) ? value.code : undefined;
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

/** 用于执行编辑器请求并校验成功投影。 */
async function requestEditorApi<T>(
  url: string,
  expectedStatus: number,
  parse: (value: unknown) => T | undefined,
  init?: RequestInit,
): Promise<EditorApiResult<T>> {
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
      error: { certainty: 'unknown', message: '无法连接文档服务，请检查网络后重试。' },
      ok: false,
    };
  }
}

/** 用于把校验通过的内容投影原样返回给调用方。 */
function parseContentDetail(value: unknown): DocumentContentDetail | undefined {
  return isDocumentContentDetail(value) ? value : undefined;
}

/** 用于读取单个文档的详情与正文内容投影。 */
export function getDocumentContent(id: string): Promise<EditorApiResult<DocumentContentDetail>> {
  return requestEditorApi(
    `${DOCUMENT_PATH}/${encodeURIComponent(id)}/content`,
    200,
    parseContentDetail,
  );
}

/** 用于按统一乐观版本保存标题与正文。 */
export function saveDocumentContent(
  id: string,
  request: SaveDocumentContentRequest,
): Promise<EditorApiResult<DocumentContentDetail>> {
  return requestEditorApi(
    `${DOCUMENT_PATH}/${encodeURIComponent(id)}/content`,
    200,
    parseContentDetail,
    {
      body: JSON.stringify(request),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    },
  );
}
