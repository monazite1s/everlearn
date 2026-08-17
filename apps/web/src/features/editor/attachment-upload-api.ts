/** @fileoverview 封装附件两段式上传的预检、直传与确认端点并校验公开响应。 */

import type {
  AttachmentDetail,
  AttachmentErrorCode,
  ConfirmAttachmentUploadRequest,
  CreateAttachmentUploadRequest,
  CreateAttachmentUploadResponse,
} from '@everlearn/contracts';

import {
  hasExactKeys,
  isRecord,
  requestApi,
  type ApiFailureEnvelope,
  type ApiResult,
} from '../../shared/api-request';

/** 与 editor-api 同构的失败信封，供上传流程展示稳定文案。 */
export type AttachmentUploadFailure = ApiFailureEnvelope<AttachmentErrorCode>;
export type AttachmentUploadResult<T> = ApiResult<T, AttachmentErrorCode>;

const ATTACHMENT_PATH = '/api/v1/attachments';
const ERROR_CODES: readonly AttachmentErrorCode[] = [
  'BAD_REQUEST',
  'HASH_MISMATCH',
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'OBJECT_MISSING',
  'SIZE_EXCEEDED',
  'TYPE_REJECTED',
  'VALIDATION_FAILED',
];

/** 用于执行附件 API 请求并按闭集校验成功投影。 */
function requestAttachmentApi<T>(
  url: string,
  expectedStatus: number,
  parse: (value: unknown) => T | undefined,
  init?: RequestInit,
): Promise<AttachmentUploadResult<T>> {
  return requestApi({
    codes: ERROR_CODES,
    expectedStatus,
    init,
    networkMessage: '无法连接附件服务，请检查网络后重试。',
    parse,
    url,
  });
}

/** 用于校验直传指令投影的字段全集与形态。 */
function parseUploadInstructions(value: unknown): CreateAttachmentUploadResponse | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['expiresAt', 'headers', 'id', 'method', 'uploadUrl'])
  ) {
    return undefined;
  }
  if (!hasUploadInstructionFields(value)) {
    return undefined;
  }
  return value as unknown as CreateAttachmentUploadResponse;
}

/** 用于校验直传指令的标量字段与必带 Content-Type 头。 */
function hasUploadInstructionFields(value: Record<string, unknown>): boolean {
  const headers = value.headers;
  const contentType = isRecord(headers) ? headers['Content-Type'] : undefined;
  return (
    typeof value.expiresAt === 'string' &&
    isRecord(headers) &&
    typeof contentType === 'string' &&
    typeof value.id === 'string' &&
    value.method === 'PUT' &&
    typeof value.uploadUrl === 'string'
  );
}

/** 用于提交上传预检并获得受约束的直传指令。 */
export function createAttachmentUpload(
  request: CreateAttachmentUploadRequest,
): Promise<AttachmentUploadResult<CreateAttachmentUploadResponse>> {
  return requestAttachmentApi(`${ATTACHMENT_PATH}/uploads`, 201, parseUploadInstructions, {
    body: JSON.stringify(request),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
}

/** 用于校验确认后的附件详情投影的字段全集与形态。 */
function parseAttachmentDetail(value: unknown): AttachmentDetail | undefined {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'createdAt',
      'fileName',
      'id',
      'kind',
      'mimeType',
      'referenceCount',
      'sizeBytes',
      'status',
      'updatedAt',
    ])
  ) {
    return undefined;
  }
  const fieldsValid =
    hasAttachmentDetailFields(value) &&
    typeof value.referenceCount === 'number' &&
    typeof value.sizeBytes === 'number';
  return fieldsValid ? (value as unknown as AttachmentDetail) : undefined;
}

/** 用于校验附件详情的字符串与受控枚举字段。 */
function hasAttachmentDetailFields(value: Record<string, unknown>): boolean {
  return (
    typeof value.createdAt === 'string' &&
    typeof value.fileName === 'string' &&
    typeof value.id === 'string' &&
    (value.kind === 'file' || value.kind === 'image') &&
    typeof value.mimeType === 'string' &&
    (value.status === 'active' || value.status === 'pending') &&
    typeof value.updatedAt === 'string'
  );
}

/** 用于在直传完成后提交对象哈希换取落库。 */
export function confirmAttachmentUpload(
  id: string,
  request: ConfirmAttachmentUploadRequest,
): Promise<AttachmentUploadResult<AttachmentDetail>> {
  return requestAttachmentApi(
    `${ATTACHMENT_PATH}/uploads/${encodeURIComponent(id)}/confirm`,
    201,
    parseAttachmentDetail,
    {
      body: JSON.stringify(request),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
}

/** 用于执行签名 PUT 直传且只返回成败结论。 */
export async function putAttachmentObject(
  uploadUrl: string,
  file: File,
  contentType: string,
): Promise<boolean> {
  try {
    const response = await fetch(uploadUrl, {
      body: file,
      headers: { 'Content-Type': contentType },
      method: 'PUT',
    });
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}
