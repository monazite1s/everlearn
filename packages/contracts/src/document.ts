/** @fileoverview 定义文档读取、创建、重命名、正文保存、删除恢复与回收站 API 的公开契约。 */

/** 用于让客户端输入与服务端校验共享同一标题长度上限。 */
export const DOCUMENT_TITLE_MAX_LENGTH = 200;

/** 用于统一回收站保留期并供到期清理 Worker 复用。 */
export const TRASH_RETENTION_DAYS = 30;

/** 当前已发布的正文 Schema 版本，Web 编辑器与服务端校验共享同一事实源。 */
export const DOCUMENT_SCHEMA_VERSION = 1;

/** 正文 JSON 递归深度上限，防御恶意嵌套且客户端解析器镜像同值。 */
export const DOCUMENT_JSON_MAX_DEPTH = 64;

/** 携带 blockId 的可引用块级节点类型（按类型生效，含嵌套实例）。 */
export const DOCUMENT_BLOCK_NODE_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'codeBlock',
  'horizontalRule',
] as const;

/** 当前 Schema 版本允许的标题层级。 */
export const DOCUMENT_APPROVED_HEADING_LEVELS = [1, 2, 3, 4] as const;

/** 当前 Schema 版本允许出现的全部节点类型。 */
export const DOCUMENT_APPROVED_NODE_TYPES: ReadonlySet<string> = new Set([
  'doc',
  ...DOCUMENT_BLOCK_NODE_TYPES,
  'listItem',
  'text',
  'hardBreak',
]);

/** 当前 Schema 版本允许出现的全部标记类型。 */
export const DOCUMENT_APPROVED_MARK_TYPES: ReadonlySet<string> = new Set([
  'bold',
  'italic',
  'strike',
  'code',
  'underline',
  'link',
]);

/** blockId 的合法格式为任意版本的标准 UUID 十六进制，忽略大小写以兼容历史输出。 */
export const DOCUMENT_BLOCK_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** 用于提交标题与正文统一版本的防抖保存，正文为待解析的结构化 JSON。 */
export interface SaveDocumentContentRequest {
  readonly contentJson: unknown;
  readonly schemaVersion: number;
  readonly title?: string;
  readonly version: number;
}

/** 用于提交文档删除所依据的乐观并发版本。 */
export interface DeleteDocumentRequest {
  readonly version: number;
}

/** 用于提交文档恢复所依据的回收站当前版本。 */
export interface RestoreDocumentRequest {
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

/** 用于在读取或保存正文时投影详情与正文 JSON、Schema 版本。 */
export interface DocumentContentDetail extends DocumentDetail {
  readonly contentJson: unknown;
  readonly schemaVersion: number;
}

/** 用于描述 document.saved 领域事件载荷的版本化内部契约。 */
export interface DocumentSavedEventPayload {
  readonly contentSchemaVersion: number;
  readonly documentId: string;
  readonly documentVersion: number;
  readonly eventSchemaVersion: 1;
  readonly knowledgeBaseId: string;
}

/** 用于返回按服务端稳定顺序排列的直接子节点分页结果。 */
export interface DocumentListResponse {
  readonly items: readonly DocumentTreeItem[];
  readonly nextCursor: string | null;
}

/** 用于区分回收站条目对应的顶层对象类型。 */
export type TrashObjectType = 'document' | 'knowledge-base';

/** 用于投影回收站条目的对象类型、原知识库、删除与到期时间。 */
export interface TrashItem {
  readonly deletedAt: string;
  readonly id: string;
  readonly knowledgeBaseId: string;
  readonly knowledgeBaseName: string;
  readonly objectType: TrashObjectType;
  readonly purgeScheduledAt: string;
  readonly title: string;
  readonly version: number;
}

/** 用于返回按删除时间倒序排列的回收站游标分页结果。 */
export interface TrashListResponse {
  readonly items: readonly TrashItem[];
  readonly nextCursor: string | null;
}

/** 用于限定文档 API 切片公开的稳定错误码。 */
export type DocumentErrorCode =
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INTERNAL_ERROR'
  | 'KNOWLEDGE_BASE_DELETED'
  | 'NOT_FOUND'
  | 'UNPROCESSABLE_ENTITY'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'VALIDATION_FAILED'
  | 'VERSION_CONFLICT';

/** 用于限定回收站列表公开的稳定错误码。 */
export type TrashErrorCode = 'BAD_REQUEST' | 'INTERNAL_ERROR' | 'VALIDATION_FAILED';
