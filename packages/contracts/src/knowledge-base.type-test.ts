/** @fileoverview Verifies knowledge-base transport projections at compile time. */

import type {
  CreateKnowledgeBaseRequest,
  KnowledgeBaseErrorCode,
  KnowledgeBaseListResponse,
  KnowledgeBaseSummary,
  KnowledgeBaseVersionRequest,
  UpdateKnowledgeBaseRequest,
} from './index';

type Assert<T extends true> = T;
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type CreateKeys = Assert<Equal<keyof CreateKnowledgeBaseRequest, 'description' | 'name'>>;
type UpdateKeys = Assert<
  Equal<keyof UpdateKnowledgeBaseRequest, 'description' | 'name' | 'version'>
>;
type VersionKeys = Assert<Equal<keyof KnowledgeBaseVersionRequest, 'version'>>;
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
    | 'BAD_REQUEST'
    | 'CONFLICT'
    | 'IDEMPOTENCY_CONFLICT'
    | 'INTERNAL_ERROR'
    | 'NOT_FOUND'
    | 'UNSUPPORTED_MEDIA_TYPE'
    | 'VALIDATION_FAILED'
    | 'VERSION_CONFLICT'
  >
>;

export type KnowledgeBaseContractAssertions = [
  CreateKeys,
  UpdateKeys,
  VersionKeys,
  SummaryKeys,
  PageShape,
  ErrorCodes,
];
