/** @fileoverview 在编译期验证 Inbox 记录传输投影。 */

import type {
  ConvertInboxItemRequest,
  CreateInboxItemRequest,
  InboxItemErrorCode,
  InboxItemListResponse,
  InboxItemKind,
  InboxItemSummary,
} from './index';

type Assert<T extends true> = T;
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type ConvertKeys = Assert<
  Equal<keyof ConvertInboxItemRequest, 'knowledgeBaseId' | 'parentId' | 'title'>
>;
type CreateKeys = Assert<Equal<keyof CreateInboxItemRequest, 'text' | 'url'>>;
type SummaryKeys = Assert<Equal<keyof InboxItemSummary, 'content' | 'createdAt' | 'id' | 'kind'>>;
type PageShape = Assert<
  Equal<
    InboxItemListResponse,
    { readonly items: readonly InboxItemSummary[]; readonly nextCursor: string | null }
  >
>;
type KindValues = Assert<Equal<InboxItemKind, 'text' | 'url'>>;
type ErrorCodes = Assert<
  Equal<
    InboxItemErrorCode,
    | 'BAD_REQUEST'
    | 'IDEMPOTENCY_CONFLICT'
    | 'INTERNAL_ERROR'
    | 'NOT_FOUND'
    | 'UNSUPPORTED_MEDIA_TYPE'
    | 'VALIDATION_FAILED'
  >
>;

export type InboxItemContractAssertions = [
  ConvertKeys,
  CreateKeys,
  SummaryKeys,
  PageShape,
  KindValues,
  ErrorCodes,
];
