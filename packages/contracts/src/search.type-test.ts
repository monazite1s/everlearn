/** @fileoverview 在编译期验证全局搜索的共享请求与响应契约。 */

import type {
  SearchContentSnippet,
  SearchErrorCode,
  SearchHighlightSegment,
  SearchRequestQuery,
  SearchResponse,
  SearchResultItem,
} from './index';

type Assert<T extends true> = T;
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type RequestKeys = Assert<
  Equal<
    keyof SearchRequestQuery,
    'cursor' | 'field' | 'knowledgeBaseId' | 'limit' | 'query' | 'scope' | 'updatedAfter'
  >
>;
type SegmentKeys = Assert<Equal<keyof SearchHighlightSegment, 'highlighted' | 'text'>>;
type SnippetKeys = Assert<
  Equal<keyof SearchContentSnippet, 'leadingTruncated' | 'segments' | 'trailingTruncated'>
>;
type ItemKeys = Assert<
  Equal<
    keyof SearchResultItem,
    | 'ancestors'
    | 'blockId'
    | 'contentSnippet'
    | 'documentId'
    | 'documentTitle'
    | 'documentVersion'
    | 'headingPath'
    | 'knowledgeBaseId'
    | 'knowledgeBaseName'
    | 'matchedField'
    | 'pathTruncated'
    | 'titleSegments'
    | 'updatedAt'
  >
>;
type ResponseShape = Assert<
  Equal<
    SearchResponse,
    {
      readonly indexStatus: 'ready' | 'updating';
      readonly items: readonly SearchResultItem[];
      readonly nextCursor: string | null;
    }
  >
>;
type ErrorCodes = Assert<
  Equal<SearchErrorCode, 'INTERNAL_ERROR' | 'NOT_FOUND' | 'VALIDATION_FAILED'>
>;

export type SearchContractAssertions = [
  RequestKeys,
  SegmentKeys,
  SnippetKeys,
  ItemKeys,
  ResponseShape,
  ErrorCodes,
];
