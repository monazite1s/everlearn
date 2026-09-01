/** @fileoverview 请求文档标签与反向链接同源 API 并校验纯文本投影。 */
// ponytail: 响应类型待并入 @everlearn/contracts；当前为 Web 端局部扩展，形状以本文件校验为准。

import { hasExactKeys, isRecord, requestApi, type ApiResult } from '../../shared/api-request';
import type { DocumentErrorCode } from '@everlearn/contracts' with { 'resolution-mode': 'import' };

const TAGS_PATH = '/api/v1/documents';
const ERROR_CODES: readonly DocumentErrorCode[] = [
  'BAD_REQUEST',
  'CONFLICT',
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'UNPROCESSABLE_ENTITY',
  'VALIDATION_FAILED',
];

/** 单个标签的公开投影。 */
export interface TagItem {
  readonly id: string;
  readonly name: string;
}

/** 单条反向链接来源的公开投影。 */
export interface BacklinkItem {
  readonly blockId: string | null;
  readonly documentId: string;
  readonly documentTitle: string | null;
  readonly sourceDeleted: boolean;
}

/** 标签与反链共享的列表响应投影。 */
interface ListResponse<Item> {
  readonly items: readonly Item[];
}

/** 用于校验标签投影的字段全集与文本形态。 */
function isTagItem(value: unknown): value is TagItem {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['id', 'name']) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    value.name.length > 0
  );
}

/** 用于校验反链投影的字段全集与来源删除标注。 */
function isBacklinkItem(value: unknown): value is BacklinkItem {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['blockId', 'documentId', 'documentTitle', 'sourceDeleted']) &&
    typeof value.documentId === 'string' &&
    (typeof value.documentTitle === 'string' || value.documentTitle === null) &&
    (typeof value.blockId === 'string' || value.blockId === null) &&
    typeof value.sourceDeleted === 'boolean'
  );
}

/** 用于校验列表响应的数组形态。 */
function parseList<Item>(value: unknown, isItem: (item: unknown) => item is Item) {
  return isRecord(value) && Array.isArray(value.items) && value.items.every(isItem)
    ? { items: value.items }
    : undefined;
}

/** 用于读取当前文档的标签列表。 */
export function getDocumentTags(
  id: string,
): Promise<ApiResult<ListResponse<TagItem>, DocumentErrorCode>> {
  return requestApi({
    codes: ERROR_CODES,
    expectedStatus: 200,
    networkMessage: '无法连接标签服务，请检查网络后重试。',
    parse: /** 用于收窄标签列表投影。 */ (value) => parseList(value, isTagItem),
    url: `${TAGS_PATH}/${encodeURIComponent(id)}/tags`,
  });
}

/** 用于整体设置当前文档的标签列表。 */
export function setDocumentTags(
  id: string,
  names: readonly string[],
): Promise<ApiResult<ListResponse<TagItem>, DocumentErrorCode>> {
  return requestApi({
    codes: ERROR_CODES,
    expectedStatus: 200,
    init: {
      body: JSON.stringify({ names }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    },
    networkMessage: '无法连接标签服务，请检查网络后重试。',
    parse: /** 用于收窄标签列表投影。 */ (value) => parseList(value, isTagItem),
    url: `${TAGS_PATH}/${encodeURIComponent(id)}/tags`,
  });
}

/** 用于读取指向当前文档的反向链接列表。 */
export function getDocumentBacklinks(
  id: string,
): Promise<ApiResult<ListResponse<BacklinkItem>, DocumentErrorCode>> {
  return requestApi({
    codes: ERROR_CODES,
    expectedStatus: 200,
    networkMessage: '无法连接反向链接服务，请检查网络后重试。',
    parse: /** 用于收窄反链列表投影。 */ (value) => parseList(value, isBacklinkItem),
    url: `${TAGS_PATH}/${encodeURIComponent(id)}/backlinks`,
  });
}
