/** @fileoverview Verifies knowledge-base transport projections at compile time. */

import type {
  CreateKnowledgeBaseRequest,
  KnowledgeBaseErrorCode,
  KnowledgeBaseListResponse,
  KnowledgeBaseSummary,
} from './index';

type Assert<T extends true> = T;
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type CreateKeys = Assert<Equal<keyof CreateKnowledgeBaseRequest, 'description' | 'name'>>;
type SummaryKeys = Assert<
  Equal<
    keyof KnowledgeBaseSummary,
    'description' | 'documentCount' | 'id' | 'kind' | 'name' | 'updatedAt' | 'version'
  >
>;
type PageShape = Assert<
  Equal<
    KnowledgeBaseListResponse,
    {
      readonly items: readonly KnowledgeBaseSummary[];
      readonly nextCursor: string | null;
    }
  >
>;
type ErrorCodes = Assert<
  Equal<
    KnowledgeBaseErrorCode,
    'BAD_REQUEST' | 'INTERNAL_ERROR' | 'NOT_FOUND' | 'UNSUPPORTED_MEDIA_TYPE' | 'VALIDATION_FAILED'
  >
>;

export type KnowledgeBaseContractAssertions = [CreateKeys, SummaryKeys, PageShape, ErrorCodes];
