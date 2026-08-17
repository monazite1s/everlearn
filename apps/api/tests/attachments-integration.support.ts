/** @fileoverview 提供附件集成测试共享的两段式上传与真实 S3 流程助手。 */

import { createHash } from 'node:crypto';

import request from 'supertest';
import type { DocumentsTestEnvironment } from './documents-integration.support';

/** 用于承载一次已确认附件的最小标识。 */
export interface ConfirmedAttachment {
  readonly id: string;
  readonly sha256: string;
}

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

/** 用于生成合法 blockId 形态的附件节点标识。 */
export function blockIdOf(sequence: number): string {
  return `99999999-9999-4999-8999-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于提交上传预检请求。 */
export function createUpload(environment: DocumentsTestEnvironment, body: object) {
  return request(environment.getHttpServer()).post('/api/v1/attachments/uploads').send(body);
}

/** 用于从直传 URL 提取对象键。 */
export function objectKeyOf(uploadUrl: string): string {
  const path = new URL(uploadUrl).pathname;
  return path.split('/').slice(2).join('/');
}

/** 用于提交确认请求。 */
export function confirmUpload(environment: DocumentsTestEnvironment, id: string, sha256: string) {
  return request(environment.getHttpServer())
    .post(`/api/v1/attachments/uploads/${id}/confirm`)
    .send({ sha256 });
}

/** 用于执行一次预检加直传并返回未确认状态。 */
export async function presignAndPut(
  environment: DocumentsTestEnvironment,
  fileName: string,
  mimeType: string,
  bytes: Buffer,
): Promise<{ id: string; sha256: string; uploadUrl: string }> {
  const response = await createUpload(environment, {
    fileName,
    mimeType,
    sizeBytes: bytes.length,
  });
  if (response.status !== 201) throw new Error(`precheck failed with ${response.status}`);
  const instruction = environment.parseBody<{
    headers: { 'Content-Type': string };
    id: string;
    uploadUrl: string;
  }>(response);
  const put = await fetch(instruction.uploadUrl, {
    body: new Uint8Array(bytes),
    headers: instruction.headers,
    method: 'PUT',
  });
  if (put.status !== 200) throw new Error(`presigned PUT failed with ${put.status}`);
  return { id: instruction.id, sha256: sha256Of(bytes), uploadUrl: instruction.uploadUrl };
}

/** 用于完成两段式上传并返回确认后的附件标识。 */
export async function createConfirmedAttachment(
  environment: DocumentsTestEnvironment,
  fileName = '图片.png',
  mimeType = 'image/png',
  bytes: Buffer = PNG_BYTES,
): Promise<ConfirmedAttachment> {
  const pending = await presignAndPut(environment, fileName, mimeType, bytes);
  const response = await confirmUpload(environment, pending.id, pending.sha256);
  if (response.status !== 200) throw new Error(`confirm failed with ${response.status}`);
  return { id: pending.id, sha256: pending.sha256 };
}

/** 用于计算字节摘要。 */
export function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** 用于构造引用附件的 image 节点。 */
export function imageNode(blockId: string, attachmentId: string, alt?: string) {
  return {
    attrs: alt === undefined ? { attachmentId, blockId } : { alt, attachmentId, blockId },
    type: 'image',
  };
}

/** 用于构造引用附件的 attachment 节点。 */
export function attachmentNode(blockId: string, attachmentId: string, fileName?: string) {
  return {
    attrs: fileName === undefined ? { attachmentId, blockId } : { attachmentId, blockId, fileName },
    type: 'attachment',
  };
}

/** 用于构造包含给定节点的最小正文。 */
export function contentOf(...nodes: object[]) {
  return { content: nodes, type: 'doc' };
}
