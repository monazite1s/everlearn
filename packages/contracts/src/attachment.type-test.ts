/** @fileoverview 在编译期验证附件传输投影与常量闭集。 */

import type {
  AttachmentDetail,
  AttachmentErrorCode,
  AttachmentKind,
  AttachmentStatus,
  ConfirmAttachmentUploadRequest,
  CreateAttachmentUploadRequest,
  CreateAttachmentUploadResponse,
} from './index';

type Assert<T extends true> = T;
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? true
    : false;

type CreateUploadKeys = Assert<
  Equal<keyof CreateAttachmentUploadRequest, 'fileName' | 'mimeType' | 'sizeBytes'>
>;
type UploadResponseShape = Assert<
  Equal<
    CreateAttachmentUploadResponse,
    {
      readonly expiresAt: string;
      readonly headers: Readonly<{ readonly 'Content-Type': string }>;
      readonly id: string;
      readonly method: 'PUT';
      readonly uploadUrl: string;
    }
  >
>;
type ConfirmKeys = Assert<Equal<keyof ConfirmAttachmentUploadRequest, 'sha256'>>;
type DetailShape = Assert<
  Equal<
    AttachmentDetail,
    {
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
  >
>;
type KindValues = Assert<Equal<AttachmentKind, 'file' | 'image'>>;
type StatusValues = Assert<Equal<AttachmentStatus, 'active' | 'pending'>>;
type ErrorCodes = Assert<
  Equal<
    AttachmentErrorCode,
    | 'BAD_REQUEST'
    | 'HASH_MISMATCH'
    | 'INTERNAL_ERROR'
    | 'NOT_FOUND'
    | 'OBJECT_MISSING'
    | 'SIZE_EXCEEDED'
    | 'TYPE_REJECTED'
    | 'VALIDATION_FAILED'
  >
>;

export type AttachmentContractAssertions = [
  CreateUploadKeys,
  UploadResponseShape,
  ConfirmKeys,
  DetailShape,
  KindValues,
  StatusValues,
  ErrorCodes,
];
