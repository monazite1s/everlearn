/** @fileoverview 请求 Search API 并严格校验纯文本公开投影。 */

import type {
  SearchAncestor,
  SearchContentSnippet,
  SearchErrorCode,
  SearchHighlightSegment,
  SearchRequestQuery,
  SearchResponse,
  SearchResultItem,
} from '@everlearn/contracts';

import { hasExactKeys, isRecord, requestApi, type ApiResult } from '../../shared/api-request';

const SEARCH_CODES: readonly SearchErrorCode[] = [
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'VALIDATION_FAILED',
];
const BASE_KEYS = [
  'ancestors',
  'blockId',
  'contentSnippet',
  'documentId',
  'documentTitle',
  'documentVersion',
  'headingPath',
  'knowledgeBaseId',
  'knowledgeBaseName',
  'matchedField',
  'pathTruncated',
  'titleSegments',
  'updatedAt',
] as const;
const MAX_ANCESTORS = 8;
const MAX_CURSOR_LENGTH = 512;
const MAX_HEADING_LENGTH = 200;
const MAX_HEADING_PATH = 4;
const MAX_NAME_LENGTH = 200;
const MAX_RESULTS = 100;
const MAX_SNIPPET_LENGTH = 240;
const MAX_TEXT_LENGTH = 500;
const MAX_TITLE_SEGMENTS = 16;

/** 用于按 Unicode 码点而非 UTF-16 单元限制不可信文本。 */
function hasTextLimit(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && Array.from(value).length <= maximum;
}

/** 用于校验 UUID 公开标识符。 */
function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

/** 用于校验服务端纯文本高亮分段。 */
function isSegment(value: unknown, maximum = MAX_TEXT_LENGTH): value is SearchHighlightSegment {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['highlighted', 'text']) &&
    typeof value.highlighted === 'boolean' &&
    hasTextLimit(value.text, maximum)
  );
}

/** 用于校验公开祖先投影。 */
function isAncestor(value: unknown): value is SearchAncestor {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['documentId', 'title']) &&
    isUuid(value.documentId) &&
    hasTextLimit(value.title, MAX_NAME_LENGTH)
  );
}

/** 用于校验正文摘要投影不含 HTML 通道。 */
function isSnippet(value: unknown): value is SearchContentSnippet {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['leadingTruncated', 'segments', 'trailingTruncated'])
  )
    return false;
  if (!Array.isArray(value.segments) || value.segments.length === 0) return false;
  if (!value.segments.every((segment) => isSegment(segment, MAX_SNIPPET_LENGTH))) return false;
  const textLength = value.segments.reduce(
    (total, segment) => total + Array.from(segment.text).length,
    0,
  );
  return (
    typeof value.leadingTruncated === 'boolean' &&
    typeof value.trailingTruncated === 'boolean' &&
    textLength <= MAX_SNIPPET_LENGTH
  );
}

/** 用于校验结果身份、版本与时间字段。 */
function hasValidIdentity(value: Record<string, unknown>): boolean {
  return (
    isUuid(value.documentId) &&
    typeof value.documentVersion === 'number' &&
    Number.isSafeInteger(value.documentVersion) &&
    value.documentVersion > 0 &&
    isUuid(value.knowledgeBaseId) &&
    hasTextLimit(value.updatedAt, 40) &&
    Number.isFinite(Date.parse(value.updatedAt))
  );
}

/** 用于校验标题分段的数量、内容与总长边界。 */
function hasValidTitleSegments(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.titleSegments) &&
    value.titleSegments.length > 0 &&
    value.titleSegments.length <= MAX_TITLE_SEGMENTS &&
    value.titleSegments.every((segment) => isSegment(segment)) &&
    value.titleSegments.reduce((total, segment) => total + Array.from(segment.text).length, 0) <=
      MAX_TEXT_LENGTH
  );
}

/** 用于校验结果的全部纯文本展示字段。 */
function hasValidPresentation(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.ancestors) &&
    value.ancestors.length <= MAX_ANCESTORS &&
    value.ancestors.every(isAncestor) &&
    hasTextLimit(value.documentTitle, MAX_TEXT_LENGTH) &&
    hasTextLimit(value.knowledgeBaseName, MAX_NAME_LENGTH) &&
    typeof value.pathTruncated === 'boolean' &&
    hasValidTitleSegments(value)
  );
}

/** 用于校验所有结果分支共享的公开字段。 */
function hasValidBase(value: Record<string, unknown>): boolean {
  return hasExactKeys(value, BASE_KEYS) && hasValidIdentity(value) && hasValidPresentation(value);
}

/** 用于校验标题命中分支只能打开文档顶部。 */
function isTitleResult(value: Record<string, unknown>): boolean {
  return (
    value.matchedField === 'title' &&
    value.blockId === null &&
    value.contentSnippet === null &&
    Array.isArray(value.headingPath) &&
    value.headingPath.length === 0
  );
}

/** 用于校验正文命中分支具备稳定 Block 定位信息。 */
function isContentResult(value: Record<string, unknown>): boolean {
  return (
    (value.matchedField === 'content' || value.matchedField === 'both') &&
    isUuid(value.blockId) &&
    isSnippet(value.contentSnippet) &&
    Array.isArray(value.headingPath) &&
    value.headingPath.length <= MAX_HEADING_PATH &&
    value.headingPath.every((heading) => hasTextLimit(heading, MAX_HEADING_LENGTH))
  );
}

/** 用于收窄一项公开搜索结果。 */
function isSearchResult(value: unknown): value is SearchResultItem {
  return isRecord(value) && hasValidBase(value) && (isTitleResult(value) || isContentResult(value));
}

/** 用于校验服务端生成的不透明游标形态，null 表示没有下一页。 */
function hasValidCursorShape(value: unknown): value is string | null {
  if (value === null) return true;
  return (
    typeof value === 'string' &&
    hasTextLimit(value, MAX_CURSOR_LENGTH) &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

/** 用于解析一页严格 Search API 响应。 */
function parseSearchResponse(value: unknown): SearchResponse | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ['indexStatus', 'items', 'nextCursor'])) return;
  if (value.indexStatus !== 'ready' && value.indexStatus !== 'updating') return;
  if (!Array.isArray(value.items) || value.items.length > MAX_RESULTS) return;
  if (!value.items.every(isSearchResult)) return;
  if (!hasValidCursorShape(value.nextCursor)) return;
  return { indexStatus: value.indexStatus, items: value.items, nextCursor: value.nextCursor };
}

/** 用于把批准的搜索请求编码到同源 GET 查询。 */
function searchUrl(request: SearchRequestQuery): string {
  const params = new URLSearchParams({ query: request.query });
  if (request.scope) params.set('scope', request.scope);
  if (request.knowledgeBaseId) params.set('knowledgeBaseId', request.knowledgeBaseId);
  if (request.field) params.set('field', request.field);
  if (request.updatedAfter) params.set('updatedAfter', request.updatedAfter);
  if (request.limit) params.set('limit', String(request.limit));
  if (request.cursor) params.set('cursor', request.cursor);
  return `/api/v1/search?${params.toString()}`;
}

/** 用于读取一页搜索结果并支持调用方取消过期请求。 */
export function searchDocuments(
  request: SearchRequestQuery,
  signal: AbortSignal,
): Promise<ApiResult<SearchResponse, SearchErrorCode>> {
  return requestApi({
    codes: SEARCH_CODES,
    expectedStatus: 200,
    init: { signal },
    networkMessage: '无法连接搜索服务，请检查网络后重试。',
    parse: parseSearchResponse,
    url: searchUrl(request),
  });
}
