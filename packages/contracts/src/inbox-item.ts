/** @fileoverview 定义 Inbox 快速记录 API 的公开请求与响应投影。 */

/** 用于让客户端输入与服务端校验共享同一记录内容长度上限。 */
export const INBOX_ITEM_CONTENT_MAX_LENGTH = 10_000;

/** 用于限定 Inbox 记录在服务端保存的载荷类型。 */
export type InboxItemKind = 'text' | 'url';

/** 用于提交二选一的非空纯文本或单个 http/https URL。 */
export interface CreateInboxItemRequest {
  readonly text?: string;
  readonly url?: string;
}

/** 用于投影不含所有权、状态与转换目标的待处理记录。 */
export interface InboxItemSummary {
  readonly content: string;
  readonly createdAt: string;
  readonly id: string;
  readonly kind: InboxItemKind;
}

/** 用于返回按创建时间倒序排列的待处理记录游标分页结果。 */
export interface InboxItemListResponse {
  readonly items: readonly InboxItemSummary[];
  readonly nextCursor: string | null;
}

/** 用于限定 Inbox 记录 API 切片公开的稳定错误码。 */
export type InboxItemErrorCode =
  'BAD_REQUEST' | 'INTERNAL_ERROR' | 'NOT_FOUND' | 'UNSUPPORTED_MEDIA_TYPE' | 'VALIDATION_FAILED';
