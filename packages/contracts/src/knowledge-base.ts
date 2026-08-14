/** @fileoverview 定义知识库 API 的公开请求与响应投影。 */

/** 用于限定知识库由产品定义的用途。 */
export type KnowledgeBaseKind = 'news' | 'normal' | 'tutorial';

/** 用于传递普通知识库创建时允许编辑的字段。 */
export interface CreateKnowledgeBaseRequest {
  readonly description?: string;
  readonly name: string;
}

/** 用于提交可编辑字段和乐观更新所依据的版本。 */
export interface UpdateKnowledgeBaseRequest {
  readonly description?: string;
  readonly name?: string;
  readonly version: number;
}

/** 用于提交知识库生命周期变更所依据的版本。 */
export interface KnowledgeBaseVersionRequest {
  readonly version: number;
}

/** 用于投影不含持久化和所有权字段的知识库。 */
export interface KnowledgeBaseSummary {
  readonly description: string;
  readonly documentCount: number;
  readonly id: string;
  readonly kind: KnowledgeBaseKind;
  readonly name: string;
  readonly updatedAt: string;
  readonly version: number;
}

/** 用于返回按最近活动排序的一页游标结果。 */
export interface KnowledgeBaseListResponse {
  readonly items: readonly KnowledgeBaseSummary[];
  readonly nextCursor: string | null;
}

/** 用于限定知识库首个 API 切片公开的稳定错误码。 */
export type KnowledgeBaseErrorCode =
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'VALIDATION_FAILED'
  | 'VERSION_CONFLICT';
