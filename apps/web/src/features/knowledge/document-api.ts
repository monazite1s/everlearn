/** @fileoverview 将文档树页面接入同源 API 并校验公开响应。 */

import type {
  CreateDocumentRequest,
  DocumentDetail,
  DocumentErrorCode,
  DocumentListResponse,
  DocumentTreeItem,
  MoveDocumentRequest,
  RenameDocumentRequest,
  RestoreDocumentRequest,
} from '@everlearn/contracts';

export interface DocumentApiFailure {
  readonly certainty: 'known' | 'unknown';
  readonly code?: DocumentErrorCode;
  readonly message: string;
  readonly requestId?: string;
}

export type DocumentApiResult<T> =
  | { readonly data: T; readonly ok: true }
  | { readonly error: DocumentApiFailure; readonly ok: false };

const KNOWLEDGE_BASE_PATH = '/api/v1/knowledge-bases';
const DOCUMENT_PATH = '/api/v1/documents';
const PAGE_LIMIT = 20;
const TREE_ITEM_KEYS = ['childCount', 'id', 'title', 'updatedAt', 'version'] as const;
const DETAIL_KEYS = [...TREE_ITEM_KEYS, 'knowledgeBaseId', 'parentId'] as const;
const ERROR_CODES: readonly DocumentErrorCode[] = [
  'BAD_REQUEST',
  'CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'INTERNAL_ERROR',
  'KNOWLEDGE_BASE_DELETED',
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

/** 用于校验序列化为安全非负整数的数值字段。 */
function isSafeIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

/** 用于校验两种文档投影共享的公开标量字段。 */
function hasTreeItemFields(value: Record<string, unknown>): boolean {
  return (
    isSafeIntegerAtLeast(value.childCount, 0) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.updatedAt === 'string' &&
    Number.isFinite(Date.parse(value.updatedAt)) &&
    isSafeIntegerAtLeast(value.version, 1)
  );
}

/** 用于在公开树节点进入页面状态前完成校验。 */
function isDocumentTreeItem(value: unknown): value is DocumentTreeItem {
  return isRecord(value) && hasExactKeys(value, TREE_ITEM_KEYS) && hasTreeItemFields(value);
}

/** 用于校验文档详情的字段与父节点形态。 */
function isDocumentDetail(value: unknown): value is DocumentDetail {
  if (!isRecord(value) || !hasExactKeys(value, DETAIL_KEYS)) return false;
  return (
    hasTreeItemFields(value) &&
    typeof value.knowledgeBaseId === 'string' &&
    (typeof value.parentId === 'string' || value.parentId === null)
  );
}

/** 用于解析不可信列表投影并保持共享契约类型。 */
function parseDocumentList(value: unknown): DocumentListResponse | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['items', 'nextCursor'])) return undefined;
  if (!Array.isArray(value.items) || !value.items.every(isDocumentTreeItem)) return undefined;
  if (value.nextCursor !== null && typeof value.nextCursor !== 'string') return undefined;
  return { items: value.items, nextCursor: value.nextCursor };
}

/** 用于把校验通过的详情原样返回给调用方。 */
export function parseDocumentDetail(value: unknown): DocumentDetail | undefined {
  return isDocumentDetail(value) ? value : undefined;
}

/** 用于将服务端错误码收窄到稳定文档契约。 */
function isDocumentErrorCode(value: unknown): value is DocumentErrorCode {
  return typeof value === 'string' && ERROR_CODES.includes(value as DocumentErrorCode);
}

/** 用于只读取服务端错误信封中稳定且用户安全的部分。 */
function parseFailure(
  value: unknown,
  certainty: DocumentApiFailure['certainty'],
): DocumentApiFailure {
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

/** 用于执行文档请求并校验成功投影。 */
async function requestDocument<T>(
  url: string,
  expectedStatus: number,
  parse: (value: unknown) => T | undefined,
  init?: RequestInit,
): Promise<DocumentApiResult<T>> {
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

/** 用于读取一个父节点的直接子节点分页。 */
export function listDocuments(
  knowledgeBaseId: string,
  parentId?: string,
  cursor?: string,
): Promise<DocumentApiResult<DocumentListResponse>> {
  const query = new URLSearchParams({ limit: String(PAGE_LIMIT) });
  if (parentId) query.set('parentId', parentId);
  if (cursor) query.set('cursor', cursor);
  const url = `${KNOWLEDGE_BASE_PATH}/${encodeURIComponent(knowledgeBaseId)}/documents?${query.toString()}`;
  return requestDocument(url, 200, parseDocumentList);
}

/** 用于创建根或子文档且不接受服务端字段。 */
export function createDocument(
  knowledgeBaseId: string,
  request: CreateDocumentRequest,
): Promise<DocumentApiResult<DocumentDetail>> {
  return requestDocument(
    `${KNOWLEDGE_BASE_PATH}/${encodeURIComponent(knowledgeBaseId)}/documents`,
    201,
    parseDocumentDetail,
    {
      body: JSON.stringify(request),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
}

/** 用于读取单个文档的公开详情。 */
export function getDocument(id: string): Promise<DocumentApiResult<DocumentDetail>> {
  return requestDocument(`${DOCUMENT_PATH}/${encodeURIComponent(id)}`, 200, parseDocumentDetail);
}

/** 用于按最后观察版本重命名文档。 */
export function renameDocument(
  id: string,
  request: RenameDocumentRequest,
): Promise<DocumentApiResult<DocumentDetail>> {
  return requestDocument(`${DOCUMENT_PATH}/${encodeURIComponent(id)}`, 200, parseDocumentDetail, {
    body: JSON.stringify(request),
    headers: { 'Content-Type': 'application/json' },
    method: 'PATCH',
  });
}

/** 用于按幂等键提交文档移动并只接受确认详情。 */
export function moveDocument(
  id: string,
  request: MoveDocumentRequest,
  idempotencyKey: string,
): Promise<DocumentApiResult<DocumentDetail>> {
  return requestDocument(
    `${DOCUMENT_PATH}/${encodeURIComponent(id)}/move`,
    200,
    parseDocumentDetail,
    {
      body: JSON.stringify(request),
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      method: 'POST',
    },
  );
}

/** 用于按幂等键从回收站恢复文档完整子树。 */
export function restoreDocument(
  id: string,
  request: RestoreDocumentRequest,
  idempotencyKey: string,
): Promise<DocumentApiResult<DocumentDetail>> {
  return requestDocument(
    `${DOCUMENT_PATH}/${encodeURIComponent(id)}/restore`,
    200,
    parseDocumentDetail,
    {
      body: JSON.stringify(request),
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      method: 'POST',
    },
  );
}
