/** @fileoverview 定义文档读取、创建与重命名 API 的公开请求与响应投影。 */

/** 用于让客户端输入与服务端校验共享同一标题长度上限。 */
export const DOCUMENT_TITLE_MAX_LENGTH = 200;

/** 用于提交文档创建时仅允许的服务端树定位字段和标题。 */
export interface CreateDocumentRequest {
  readonly parentId?: string;
  readonly title: string;
}

/** 用于提交重命名标题和乐观更新所依据的版本。 */
export interface RenameDocumentRequest {
  readonly title: string;
  readonly version: number;
}

/** 用于提交移动目标父级、单个相邻定位和乐观更新所依据的版本。 */
export interface MoveDocumentRequest {
  readonly afterId?: string;
  readonly beforeId?: string;
  readonly targetParentId?: string;
  readonly version: number;
}

/** 用于投影不含持久化、所有权与树内部排序字段的树节点。 */
export interface DocumentTreeItem {
  readonly childCount: number;
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly version: number;
}

/** 用于投影单个文档详情且不暴露正文与物化路径。 */
export interface DocumentDetail {
  readonly childCount: number;
  readonly id: string;
  readonly knowledgeBaseId: string;
  readonly parentId: string | null;
  readonly title: string;
  readonly updatedAt: string;
  readonly version: number;
}

/** 用于返回按服务端稳定顺序排列的直接子节点分页结果。 */
export interface DocumentListResponse {
  readonly items: readonly DocumentTreeItem[];
  readonly nextCursor: string | null;
}

/** 用于限定文档 API 切片公开的稳定错误码。 */
export type DocumentErrorCode =
  | 'BAD_REQUEST'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'VALIDATION_FAILED'
  | 'VERSION_CONFLICT';
