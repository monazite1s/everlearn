/** @fileoverview 定义附件两段式上传、确认、下载授权与孤儿清理的公开契约。 */

/** 图片类附件的大小上限（字节）。 */
export const ATTACHMENT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** 通用附件的大小上限（字节）。 */
export const ATTACHMENT_FILE_MAX_BYTES = 25 * 1024 * 1024;

/** 允许直传的图片 MIME 白名单，svg 因脚本风险被排除。 */
export const ATTACHMENT_IMAGE_MIME_TYPES = [
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/** 通用附件的扩展名白名单（小写、不含点）。 */
export const ATTACHMENT_FILE_EXTENSIONS = [
  'csv',
  'docx',
  'md',
  'pdf',
  'pptx',
  'txt',
  'xlsx',
  'zip',
] as const;

/** pending 对象在最近一次生命周期变化后允许存留的小时数，超时由孤儿清理删除。 */
export const ATTACHMENT_PENDING_TTL_HOURS = 24;

/** 客户端原始文件名长度上限。 */
export const ATTACHMENT_FILE_NAME_MAX_LENGTH = 255;

/** 图片节点 alt 文本长度上限，供正文校验器共享。 */
export const ATTACHMENT_ALT_MAX_LENGTH = 500;

/** 用于提交上传预检的声明字段：文件名、MIME 与字节数。 */
export interface CreateAttachmentUploadRequest {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

/** 用于返回预检通过的直传指令：目标 URL、必须携带的请求头与过期时间。 */
export interface CreateAttachmentUploadResponse {
  readonly expiresAt: string;
  readonly headers: Readonly<{ readonly 'Content-Type': string }>;
  readonly id: string;
  readonly method: 'PUT';
  readonly uploadUrl: string;
}

/** 用于在直传完成后提交对象 SHA-256（小写十六进制 64 位）以换取落库。 */
export interface ConfirmAttachmentUploadRequest {
  readonly sha256: string;
}

/** 附件用途分类：白名单图片或扩展名白名单通用文件。 */
export type AttachmentKind = 'file' | 'image';

/** 附件生命周期：pending 未被正文引用，active 被至少一个块引用。 */
export type AttachmentStatus = 'active' | 'pending';

/** 用于投影附件行不含对象键与所有权内部字段。 */
export interface AttachmentDetail {
  readonly createdAt: string;
  readonly fileName: string;
  readonly id: string;
  readonly kind: AttachmentKind;
  readonly mimeType: string;
  readonly referenceCount: number;
  readonly sizeBytes: number;
  readonly status: AttachmentStatus;
  readonly updatedAt: string;
}

/** 用于限定附件 API 切片公开的稳定错误码。 */
export type AttachmentErrorCode =
  | 'BAD_REQUEST'
  | 'HASH_MISMATCH'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND'
  | 'OBJECT_MISSING'
  | 'SIZE_EXCEEDED'
  | 'TYPE_REJECTED'
  | 'VALIDATION_FAILED';
