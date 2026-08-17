/** @fileoverview 将编辑器正文读取、保存与修订触发接入同源 API 并校验公开响应。 */

import type {
  CreateDocumentRevisionRequest,
  DocumentContentDetail,
  DocumentErrorCode,
  DocumentRevisionDetail,
  DocumentRevisionListItem,
  DocumentRevisionListResponse,
  DocumentRevisionSource,
  RestoreDocumentRevisionRequest,
  SaveDocumentContentRequest,
} from '@everlearn/contracts';
import { DOCUMENT_REVISION_SOURCES } from '@everlearn/contracts';

import {
  hasExactKeys,
  isRecord,
  requestApi,
  type ApiFailureEnvelope,
  type ApiResult,
} from '../../shared/api-request';

export type EditorApiFailure = ApiFailureEnvelope<DocumentErrorCode>;
export type EditorApiResult<T> = ApiResult<T, DocumentErrorCode>;

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

/** 用于执行文档 API 请求并按闭集校验成功投影。 */
function requestEditorApi<T>(
  url: string,
  expectedStatus: number,
  parse: (value: unknown) => T | undefined,
  init?: RequestInit,
): Promise<EditorApiResult<T>> {
  return requestApi({
    codes: ERROR_CODES,
    expectedStatus,
    init,
    networkMessage: '无法连接文档服务，请检查网络后重试。',
    parse,
    url,
  });
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

const REVISION_DETAIL_KEYS = [
  'contentJson',
  'createdAt',
  'plainText',
  'revisionNumber',
  'schemaVersion',
  'snippet',
  'source',
  'title',
] as const;
const REVISION_LIST_ITEM_KEYS = [
  'createdAt',
  'revisionNumber',
  'snippet',
  'source',
  'title',
] as const;

/** 用于把服务端来源收窄到共享契约受控枚举。 */
function isRevisionSource(value: unknown): value is DocumentRevisionSource {
  return (
    typeof value === 'string' && (DOCUMENT_REVISION_SOURCES as readonly string[]).includes(value)
  );
}

/** 用于校验修订详情共享的字符串与正整数字段。 */
function hasRevisionDetailFields(value: Record<string, unknown>): boolean {
  return (
    typeof value.createdAt === 'string' &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    isSafeIntegerAtLeast(value.revisionNumber, 1) &&
    isSafeIntegerAtLeast(value.schemaVersion, 1) &&
    typeof value.snippet === 'string' &&
    typeof value.title === 'string'
  );
}

/** 用于校验修订全文投影的字段全集与形态。 */
function isDocumentRevisionDetail(value: unknown): value is DocumentRevisionDetail {
  if (!isRecord(value) || !hasExactKeys(value, REVISION_DETAIL_KEYS)) return false;
  return (
    hasRevisionDetailFields(value) &&
    isRecord(value.contentJson) &&
    typeof value.plainText === 'string' &&
    isRevisionSource(value.source)
  );
}

/** 用于把校验通过的修订投影原样返回给调用方。 */
function parseRevisionDetail(value: unknown): DocumentRevisionDetail | undefined {
  return isDocumentRevisionDetail(value) ? value : undefined;
}

/** 用于校验修订列表条目的字段全集与形态。 */
function isDocumentRevisionListItem(value: unknown): value is DocumentRevisionListItem {
  if (!isRecord(value) || !hasExactKeys(value, REVISION_LIST_ITEM_KEYS)) return false;
  return (
    typeof value.createdAt === 'string' &&
    Number.isFinite(Date.parse(value.createdAt)) &&
    isSafeIntegerAtLeast(value.revisionNumber, 1) &&
    typeof value.snippet === 'string' &&
    typeof value.title === 'string' &&
    isRevisionSource(value.source)
  );
}

/** 用于校验修订列表分页响应的字段全集与形态。 */
function parseRevisionList(value: unknown): DocumentRevisionListResponse | undefined {
  if (!isRecord(value) || !Array.isArray(value.items)) return undefined;
  if (value.nextCursor !== null && typeof value.nextCursor !== 'string') return undefined;
  if (!value.items.every((item) => isDocumentRevisionListItem(item))) return undefined;
  return value as unknown as DocumentRevisionListResponse;
}

/** 用于按修订号倒序读取修订摘要的游标分页。 */
export function listDocumentRevisions(
  id: string,
  cursor?: string,
): Promise<EditorApiResult<DocumentRevisionListResponse>> {
  const query = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`;
  return requestEditorApi(
    `${DOCUMENT_PATH}/${encodeURIComponent(id)}/revisions${query}`,
    200,
    parseRevisionList,
  );
}

/** 用于在显式触发点为当前编辑内容创建不可变修订。 */
export function createDocumentRevision(
  id: string,
  request: CreateDocumentRevisionRequest,
): Promise<EditorApiResult<DocumentRevisionDetail>> {
  return requestEditorApi(
    `${DOCUMENT_PATH}/${encodeURIComponent(id)}/revisions`,
    201,
    parseRevisionDetail,
    {
      body: JSON.stringify(request),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
}

/** 用于读取单个修订的全文快照作为恢复预览。 */
export function getDocumentRevision(
  id: string,
  revisionNumber: number,
): Promise<EditorApiResult<DocumentRevisionDetail>> {
  return requestEditorApi(
    `${DOCUMENT_PATH}/${encodeURIComponent(id)}/revisions/${revisionNumber}`,
    200,
    parseRevisionDetail,
  );
}

/** 用于按当前文档版本把历史修订恢复为新的恢复修订。 */
export function restoreDocumentRevision(
  id: string,
  revisionNumber: number,
  request: RestoreDocumentRevisionRequest,
): Promise<EditorApiResult<DocumentContentDetail>> {
  return requestEditorApi(
    `${DOCUMENT_PATH}/${encodeURIComponent(id)}/revisions/${revisionNumber}/restore`,
    200,
    parseContentDetail,
    {
      body: JSON.stringify(request),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
}
