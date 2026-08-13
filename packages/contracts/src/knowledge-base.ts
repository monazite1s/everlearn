/** @fileoverview Defines public request and response projections for knowledge-base APIs. */

/** Identifies the product-owned purpose of a knowledge base. */
export type KnowledgeBaseKind = 'news' | 'normal' | 'tutorial';

/** Carries user-editable fields accepted when creating a normal knowledge base. */
export interface CreateKnowledgeBaseRequest {
  readonly description?: string;
  readonly name: string;
}

/** Carries editable fields and the last observed version for an optimistic update. */
export interface UpdateKnowledgeBaseRequest {
  readonly description?: string;
  readonly name?: string;
  readonly version: number;
}

/** Carries the last observed version for a knowledge-base lifecycle transition. */
export interface KnowledgeBaseVersionRequest {
  readonly version: number;
}

/** Projects one knowledge base without persistence or ownership fields. */
export interface KnowledgeBaseSummary {
  readonly description: string;
  readonly documentCount: number;
  readonly id: string;
  readonly kind: KnowledgeBaseKind;
  readonly name: string;
  readonly updatedAt: string;
  readonly version: number;
}

/** Returns one cursor page ordered by recent activity. */
export interface KnowledgeBaseListResponse {
  readonly items: readonly KnowledgeBaseSummary[];
  readonly nextCursor: string | null;
}

/** Enumerates stable client decisions exposed by the first knowledge-base API slice. */
export type KnowledgeBaseErrorCode =
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'VALIDATION_FAILED'
  | 'VERSION_CONFLICT';
