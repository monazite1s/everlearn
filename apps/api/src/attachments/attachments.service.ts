/** @fileoverview 实现附件两段式上传预检、确认复核与授权读取的应用服务。 */

import type {
  AttachmentDetail,
  AttachmentKind,
  CreateAttachmentUploadResponse,
} from '@everlearn/contracts' with { 'resolution-mode': 'import' };
import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import { ApiDomainException } from '../http-boundary/api-domain.exception';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { AttachmentStorageProvider } from './attachment-storage.provider';
import type { UploadedObjectSnapshot } from './attachment-storage.provider';
import type { ConfirmAttachmentUploadDto } from './confirm-attachment-upload.dto';
import type { CreateAttachmentUploadDto } from './create-attachment-upload.dto';

/** 用于承载直传前经白名单与上限解析出的约束。 */
interface AttachmentConstraints {
  readonly kind: AttachmentKind;
  readonly mimeType: string;
}

/** 用于持有确认与下载流程所需的行投影。 */
interface UploadRow {
  readonly id: string;
  readonly mime_type: string;
  readonly object_key: string;
  readonly sha256: string | null;
  readonly size_bytes: string;
}

/** 用于承载授权下载所需的流与展示元数据。 */
export interface AttachmentDownload {
  readonly body: Readable;
  readonly detail: AttachmentDetail;
  readonly mimeType: string;
}

const DOMAIN_PROBLEMS = {
  HASH_MISMATCH: {
    code: 'HASH_MISMATCH',
    message: '文件内容校验失败，请重新上传。',
    status: 422,
  },
  OBJECT_MISSING: {
    code: 'OBJECT_MISSING',
    message: '上传尚未完成，请先完成文件上传。',
    status: 409,
  },
  SIZE_EXCEEDED: { code: 'SIZE_EXCEEDED', message: '文件大小超出允许上限。', status: 422 },
  TYPE_REJECTED: { code: 'TYPE_REJECTED', message: '文件类型不在允许范围内。', status: 422 },
} as const;

/** 用于抛出白名单领域拒绝。 */
function rejectDomain(code: keyof typeof DOMAIN_PROBLEMS): never {
  throw new ApiDomainException({ kind: 'domain', ...DOMAIN_PROBLEMS[code] });
}

/** 用于规范化 MIME：小写并去除参数后缀。 */
function normalizeMimeType(value: string): string {
  return (value.split(';', 1)[0] ?? value).trim().toLowerCase();
}

/** 用于按共享白名单解析图片或通用附件约束，不匹配时抛类型或大小拒绝。 */
async function resolveConstraints(
  fileName: string,
  mimeType: string,
  sizeBytes: number,
): Promise<AttachmentConstraints> {
  const contracts = await import('@everlearn/contracts');
  const normalized = normalizeMimeType(mimeType);
  const isImage = new Set<string>(contracts.ATTACHMENT_IMAGE_MIME_TYPES).has(normalized);
  if (!isImage) {
    const extension = fileName.split('.').at(-1)?.toLowerCase() ?? '';
    if (!new Set<string>(contracts.ATTACHMENT_FILE_EXTENSIONS).has(extension)) {
      rejectDomain('TYPE_REJECTED');
    }
  }
  if (normalized.length < 3) rejectDomain('TYPE_REJECTED');
  const maxBytes = isImage
    ? contracts.ATTACHMENT_IMAGE_MAX_BYTES
    : contracts.ATTACHMENT_FILE_MAX_BYTES;
  if (sizeBytes > maxBytes) rejectDomain('SIZE_EXCEEDED');
  return { kind: isImage ? 'image' : 'file', mimeType: normalized };
}

/** 用于读取附件行并保持所有权不可探测。 */
async function readUploadRow(
  executor: Kysely<DatabaseSchema>,
  id: string,
  ownerId: string,
): Promise<UploadRow> {
  const row = await executor
    .selectFrom('attachments')
    .select(['id', 'mime_type', 'object_key', 'sha256', 'size_bytes'])
    .where('id', '=', id)
    .where('owner_id', '=', ownerId)
    .executeTakeFirst();
  if (row === undefined) throw new NotFoundException();
  return row;
}

/** 用于驱动受限上传的预检、确认与读取生命周期。 */
@Injectable()
export class AttachmentsService {
  /** 用于接收共享数据库客户端、可信身份与存储适配器。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identityContext: LocalIdentityContext,
    private readonly storage: AttachmentStorageProvider,
  ) {}

  /** 用于预检声明值、落 pending 行并返回带签名约束的直传指令。 */
  async createUpload(input: CreateAttachmentUploadDto): Promise<CreateAttachmentUploadResponse> {
    const { ownerId } = this.identityContext.getActor();
    const constraints = await resolveConstraints(input.fileName, input.mimeType, input.sizeBytes);
    const id = randomUUID();
    const objectKey = this.storage.createObjectKey();
    await this.databaseService.client
      .insertInto('attachments')
      .values({
        id,
        owner_id: ownerId,
        object_key: objectKey,
        file_name: input.fileName,
        mime_type: constraints.mimeType,
        kind: constraints.kind,
        size_bytes: input.sizeBytes,
        status: 'pending',
        reference_count: 0,
      })
      .execute();
    const presigned = this.storage.createPresignedPut(objectKey, constraints.mimeType);
    return {
      expiresAt: presigned.expiresAt.toISOString(),
      headers: { 'Content-Type': constraints.mimeType },
      id,
      method: 'PUT',
      uploadUrl: presigned.url,
    };
  }

  /** 用于按对象实测大小、MIME 与哈希复核直传结果并记录摘要。 */
  async confirmUpload(id: string, input: ConfirmAttachmentUploadDto): Promise<AttachmentDetail> {
    const { ownerId } = this.identityContext.getActor();
    const row = await readUploadRow(this.databaseService.client, id, ownerId);
    if (row.sha256 !== null) {
      if (row.sha256 === input.sha256) return this.read(id);
      rejectDomain('HASH_MISMATCH');
    }
    const uploaded = await this.storage.readUploadedObject(row.object_key);
    if (uploaded === undefined) rejectDomain('OBJECT_MISSING');
    try {
      assertSnapshotMatches(row, uploaded, input.sha256);
    } catch (error) {
      if (error instanceof ApiDomainException) await this.discardFailedUpload(id, ownerId);
      throw error;
    }
    const confirmed = await this.databaseService.client
      .updateTable('attachments')
      .set({ sha256: input.sha256 })
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .where('sha256', 'is', null)
      .executeTakeFirst();
    if (confirmed.numUpdatedRows === 0n) {
      const raced = await readUploadRow(this.databaseService.client, id, ownerId);
      if (raced.sha256 === null) throw new NotFoundException();
      if (raced.sha256 !== input.sha256) rejectDomain('HASH_MISMATCH');
    }
    return this.read(id);
  }

  /** 用于读取附件公开投影且不泄露缺失或他人记录。 */
  async read(id: string): Promise<AttachmentDetail> {
    const { ownerId } = this.identityContext.getActor();
    const row = await this.databaseService.client
      .selectFrom('attachments')
      .select([
        'created_at',
        'file_name',
        'id',
        'kind',
        'mime_type',
        'reference_count',
        'size_bytes',
        'status',
        'updated_at',
      ])
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .executeTakeFirst();
    if (row === undefined) throw new NotFoundException();
    return {
      createdAt: row.created_at.toISOString(),
      fileName: row.file_name,
      id: row.id,
      kind: row.kind,
      mimeType: row.mime_type,
      referenceCount: row.reference_count,
      sizeBytes: Number(row.size_bytes),
      status: row.status,
      updatedAt: row.updated_at.toISOString(),
    };
  }

  /** 用于打开授权下载流，行或对象缺失统一按不可访问拒绝。 */
  async openContent(id: string): Promise<AttachmentDownload> {
    const detail = await this.read(id);
    const { ownerId } = this.identityContext.getActor();
    const row = await readUploadRow(this.databaseService.client, id, ownerId);
    const object = await this.storage.openObject(row.object_key);
    if (object === undefined) throw new NotFoundException();
    return { body: object.body, detail, mimeType: object.mimeType };
  }

  /** 用于删除复核失败对象，行仅在未确认且无引用时删除以防悬空或破坏已确认状态。 */
  private async discardFailedUpload(id: string, ownerId: string): Promise<void> {
    const row = await readUploadRow(this.databaseService.client, id, ownerId);
    const removed = await this.databaseService.client
      .deleteFrom('attachments')
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .where('sha256', 'is', null)
      .where('reference_count', '=', 0)
      .executeTakeFirst();
    if (removed.numDeletedRows === 0n) return;
    await this.storage.deleteObject(row.object_key);
  }
}

/** 用于比对实测快照与预检声明及提交摘要。 */
function assertSnapshotMatches(
  row: UploadRow,
  uploaded: UploadedObjectSnapshot,
  sha256: string,
): void {
  if (uploaded.sizeBytes !== Number(row.size_bytes)) rejectDomain('SIZE_EXCEEDED');
  if (normalizeMimeType(uploaded.mimeType) !== row.mime_type) rejectDomain('TYPE_REJECTED');
  if (uploaded.sha256 !== sha256) rejectDomain('HASH_MISMATCH');
}
