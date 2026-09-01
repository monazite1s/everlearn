/** @fileoverview 定义全局搜索 API 的公开请求、结果和纯文本高亮投影。 */

export const SEARCH_QUERY_MAX_LENGTH = 200;
export const SEARCH_CURSOR_MAX_LENGTH = 512;
export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 100;

export type SearchScope = 'all' | 'knowledgeBase';
export type SearchField = 'all' | 'content' | 'title';
export type SearchMatchedField = 'both' | 'content' | 'title';
export type SearchIndexStatus = 'ready' | 'updating';

/** 用于描述浏览器可逐段安全渲染的纯文本高亮。 */
export interface SearchHighlightSegment {
  readonly highlighted: boolean;
  readonly text: string;
}

/** 用于公开祖先文档的展示身份而不泄露物化路径。 */
export interface SearchAncestor {
  readonly documentId: string;
  readonly title: string;
}

/** 用于投影正文命中附近最多 240 个字符的纯文本摘要。 */
export interface SearchContentSnippet {
  readonly leadingTruncated: boolean;
  readonly segments: readonly SearchHighlightSegment[];
  readonly trailingTruncated: boolean;
}

/** 用于声明搜索结果跨命中类型共享的公开字段。 */
interface SearchResultBase {
  readonly ancestors: readonly SearchAncestor[];
  readonly documentId: string;
  readonly documentTitle: string;
  readonly documentVersion: number;
  readonly knowledgeBaseId: string;
  readonly knowledgeBaseName: string;
  readonly pathTruncated: boolean;
  readonly titleSegments: readonly SearchHighlightSegment[];
  readonly updatedAt: string;
}

/** 用于表示只命中文档标题且打开文档顶部的结果。 */
export interface SearchTitleResult extends SearchResultBase {
  readonly blockId: null;
  readonly contentSnippet: null;
  readonly headingPath: readonly [];
  readonly matchedField: 'title';
}

/** 用于表示只命中当前版本正文并可定位稳定 Block 的结果。 */
export interface SearchContentResult extends SearchResultBase {
  readonly blockId: string;
  readonly contentSnippet: SearchContentSnippet;
  readonly headingPath: readonly string[];
  readonly matchedField: 'content';
}

/** 用于表示标题与当前版本正文均命中且优先定位正文的结果。 */
export interface SearchBothResult extends SearchResultBase {
  readonly blockId: string;
  readonly contentSnippet: SearchContentSnippet;
  readonly headingPath: readonly string[];
  readonly matchedField: 'both';
}

export type SearchResultItem = SearchBothResult | SearchContentResult | SearchTitleResult;

/** 用于让客户端提交公开搜索参数而不携带所有权字段。 */
export interface SearchRequestQuery {
  readonly cursor?: string;
  readonly field?: SearchField;
  readonly knowledgeBaseId?: string;
  readonly limit?: number;
  readonly query: string;
  readonly scope?: SearchScope;
  readonly updatedAfter?: string;
}

/** 用于返回一页按固定相关度与 keyset 排序的文档结果。 */
export interface SearchResponse {
  readonly indexStatus: SearchIndexStatus;
  readonly items: readonly SearchResultItem[];
  readonly nextCursor: string | null;
}

export type SearchErrorCode = 'INTERNAL_ERROR' | 'NOT_FOUND' | 'VALIDATION_FAILED';
