/** @fileoverview 实现附件两段式上传流程并复刻契约白名单做客户端预检。 */

'use client';

import { useCallback } from 'react';

import {
  ATTACHMENT_FILE_EXTENSIONS,
  ATTACHMENT_FILE_MAX_BYTES,
  ATTACHMENT_FILE_NAME_MAX_LENGTH,
  ATTACHMENT_IMAGE_MAX_BYTES,
  ATTACHMENT_IMAGE_MIME_TYPES,
} from '@everlearn/contracts';

import {
  confirmAttachmentUpload,
  createAttachmentUpload,
  putAttachmentObject,
  type AttachmentUploadFailure,
} from './attachment-upload-api';

/** 附件用途分类，与契约 kind 对齐。 */
export type PendingAttachmentKind = 'file' | 'image';

/** 一次上传的最终结论：成功携带附件 id，失败携带用户可读原因。 */
export type AttachmentUploadOutcome =
  { ok: true; attachmentId: string } | { ok: false; failure: AttachmentUploadFailure };

/** 用于按图片 MIME 白名单或扩展名白名单判定附件分类。 */
export function resolveAttachmentKind(file: File): PendingAttachmentKind | undefined {
  if ((ATTACHMENT_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) return 'image';
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  if (extension && (ATTACHMENT_FILE_EXTENSIONS as readonly string[]).includes(extension)) {
    return 'file';
  }
  return undefined;
}

/** 用于在发起网络请求前按契约上限完成客户端预检。 */
function preCheck(file: File, kind: PendingAttachmentKind): string | undefined {
  if (file.name.length > ATTACHMENT_FILE_NAME_MAX_LENGTH) {
    return `文件名不能超过 ${ATTACHMENT_FILE_NAME_MAX_LENGTH} 个字符。`;
  }
  const limit = kind === 'image' ? ATTACHMENT_IMAGE_MAX_BYTES : ATTACHMENT_FILE_MAX_BYTES;
  if (file.size > limit) {
    return `文件大小超出上限（${formatBytes(limit)}）。`;
  }
  if (file.size === 0) return '不能上传空文件。';
  return undefined;
}

/** 用于把字节数格式化为中文可读大小。 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** 用于计算文件 SHA-256 小写十六进制摘要。 */
async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** 暴露给编辑器宿主的上传控制器。 */
export interface AttachmentUploadController {
  readonly upload: (file: File) => Promise<AttachmentUploadOutcome>;
}

/** 用于执行预检、签名直传与哈希确认的完整两段式上传。 */
export function useAttachmentUpload(): AttachmentUploadController {
  const upload = useCallback(async (file: File): Promise<AttachmentUploadOutcome> => {
    const kind = resolveAttachmentKind(file);
    if (kind === undefined) {
      return {
        failure: { certainty: 'known', message: '不支持的文件类型，请检查图片或扩展名白名单。' },
        ok: false,
      };
    }
    const preCheckFailure = preCheck(file, kind);
    if (preCheckFailure) {
      return { failure: { certainty: 'known', message: preCheckFailure }, ok: false };
    }
    const created = await createAttachmentUpload({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    if (!created.ok) return { failure: created.error, ok: false };
    const uploaded = await putAttachmentObject(
      created.data.uploadUrl,
      file,
      created.data.headers['Content-Type'],
    );
    if (!uploaded) {
      return {
        failure: { certainty: 'unknown', message: '对象上传失败，请稍后重试。' },
        ok: false,
      };
    }
    const confirmed = await confirmAttachmentUpload(created.data.id, {
      sha256: await sha256Hex(file),
    });
    if (!confirmed.ok) return { failure: confirmed.error, ok: false };
    return { attachmentId: confirmed.data.id, ok: true };
  }, []);

  return { upload };
}
