/** @fileoverview 在真实 PostgreSQL 与 SeaweedFS 上验证附件引用计数与孤儿清理。 */

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import {
  DocumentsTestEnvironment,
  otherUserId,
  type S3FixtureEnv,
} from '../../tests/documents-integration.support';
import {
  attachmentNode,
  blockIdOf,
  contentOf,
  createConfirmedAttachment,
  imageNode,
} from '../../tests/attachments-integration.support';
import { AttachmentOrphanPurgeService } from './attachment-orphan-purge.service';
import { AttachmentStorageProvider } from './attachment-storage.provider';
import { TrashPurgeService } from '../documents/trash-purge.service';

const databaseUrl = process.env.DATABASE_URL;
const s3Env: S3FixtureEnv | undefined =
  databaseUrl === undefined ||
  process.env.S3_ENDPOINT === undefined ||
  process.env.S3_ACCESS_KEY === undefined ||
  process.env.S3_SECRET_KEY === undefined ||
  process.env.S3_BUCKET === undefined
    ? undefined
    : {
        accessKey: process.env.S3_ACCESS_KEY,
        bucket: process.env.S3_BUCKET,
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION ?? 'local',
        secretKey: process.env.S3_SECRET_KEY,
      };
const environment = new DocumentsTestEnvironment(
  `attachments_lifecycle_${process.pid}`,
  databaseUrl ?? '',
  s3Env,
);
const PURGE_SECRET = 'spec-attachment-purge-secret';
process.env.PURGE_TRIGGER_SECRET = PURGE_SECRET;
const knowledgeBaseId = 'a1000000-0000-4000-8000-000000000001';
const PURGE_NOW = new Date('2026-09-16T12:00:00.000Z');
const DAY_MS = 86_400_000;

/** 用于读取附件行的引用计数与状态。 */
async function readAttachment(id: string): Promise<{ reference_count: number; status: string }> {
  const row = await environment
    .getDatabase()
    .selectFrom('attachments')
    .select(['reference_count', 'status'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  return row;
}

/** 用于创建文档并保存引用集为 nodes 的正文，返回文档标识。 */
async function createDocumentWith(nodes: object[], title = '引用文档'): Promise<string> {
  const created = await request(environment.getHttpServer())
    .post(`/api/v1/knowledge-bases/${knowledgeBaseId}/documents`)
    .send({ title });
  expect(created.status).toBe(201);
  const detail = environment.parseBody<{ id: string; version: number }>(created);
  return saveContent(detail.id, detail.version, nodes);
}

/** 用于保存引用集为 nodes 的正文并返回文档标识。 */
async function saveContent(id: string, version: number, nodes: object[]): Promise<string> {
  const response = await request(environment.getHttpServer())
    .patch(`/api/v1/documents/${id}/content`)
    .send({ contentJson: contentOf(...nodes), schemaVersion: 1, version });
  expect(response.status).toBe(200);
  return id;
}

/** 用于读取文档当前版本。 */
async function currentVersion(id: string): Promise<number> {
  const response = await request(environment.getHttpServer()).get(`/api/v1/documents/${id}`);
  return environment.parseBody<{ version: number }>(response).version;
}

/** 用于把附件行的最近生命周期变化时间改为相对 now 的过去时刻。 */
async function ageAttachment(id: string, ms: number): Promise<void> {
  await environment
    .getDatabase()
    .updateTable('attachments')
    .set({ updated_at: new Date(PURGE_NOW.getTime() - ms) })
    .where('id', '=', id)
    .execute();
}

/** 用于验证保存与去引用驱动 pending/active 生命周期与计数。 */
async function tracksReferencesOnSave(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: '引用库' }]);
  const attachment = await createConfirmedAttachment(environment);
  const id = await createDocumentWith([imageNode(blockIdOf(1), attachment.id)]);
  expect(await readAttachment(attachment.id)).toEqual({ reference_count: 1, status: 'active' });
  const version = await currentVersion(id);
  await saveContent(id, version, [
    imageNode(blockIdOf(2), attachment.id),
    imageNode(blockIdOf(3), attachment.id),
  ]);
  expect(await readAttachment(attachment.id)).toEqual({ reference_count: 2, status: 'active' });
  await saveContent(id, await currentVersion(id), [
    {
      attrs: { blockId: blockIdOf(4) },
      content: [{ text: '纯文本', type: 'text' }],
      type: 'paragraph',
    },
  ]);
  expect(await readAttachment(attachment.id)).toEqual({ reference_count: 0, status: 'pending' });
}

/** 用于验证未知与跨所有者附件引用整体拒绝且内容不变。 */
async function rejectsUnknownOrForeignReferences(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: '拒绝库' }]);
  await environment.insertOtherUser();
  const foreignId = 'b1000000-0000-4000-8000-000000000001';
  await environment
    .getDatabase()
    .insertInto('attachments')
    .values({
      file_name: '他人.png',
      id: foreignId,
      kind: 'image',
      mime_type: 'image/png',
      object_key: `attachments/${foreignId}`,
      owner_id: otherUserId,
      size_bytes: 8,
      status: 'pending',
    })
    .execute();
  const id = await createDocumentWith([
    {
      attrs: { blockId: blockIdOf(10) },
      content: [{ text: '原内容', type: 'text' }],
      type: 'paragraph',
    },
  ]);
  const before = await currentVersion(id);
  for (const reference of ['c1000000-0000-4000-8000-000000000001', foreignId]) {
    const response = await request(environment.getHttpServer())
      .patch(`/api/v1/documents/${id}/content`)
      .send({
        contentJson: contentOf([imageNode(blockIdOf(11), reference)]),
        schemaVersion: 1,
        version: before,
      });
    environment.expectApiError(response, 422, 'UNPROCESSABLE_ENTITY', '请求无法按当前内容处理。');
  }
  expect(await currentVersion(id)).toBe(before);
}

/** 用于验证多文档共享引用计数随单文档去引用递减。 */
async function sharesReferencesAcrossDocuments(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: '共享库' }]);
  const attachment = await createConfirmedAttachment(environment);
  const first = await createDocumentWith([attachmentNode(blockIdOf(20), attachment.id, 'a.pdf')]);
  const second = await createDocumentWith([imageNode(blockIdOf(21), attachment.id)]);
  expect(await readAttachment(attachment.id)).toEqual({ reference_count: 2, status: 'active' });
  await saveContent(second, await currentVersion(second), [
    { attrs: { blockId: blockIdOf(22) }, content: [], type: 'paragraph' },
  ]);
  expect(await readAttachment(attachment.id)).toEqual({ reference_count: 1, status: 'active' });
  expect(first).toBeDefined();
}

/** 用于验证修订恢复路径同步重算引用集。 */
async function recalculatesOnRevisionRestore(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: '恢复库' }]);
  const attachment = await createConfirmedAttachment(environment);
  const withReference = [imageNode(blockIdOf(30), attachment.id)];
  const created = await request(environment.getHttpServer())
    .post(`/api/v1/knowledge-bases/${knowledgeBaseId}/documents`)
    .send({ title: '恢复文档' });
  const detail = environment.parseBody<{ id: string; version: number }>(created);
  await saveContent(detail.id, detail.version, withReference);
  // 文档创建即落一条空正文初始修订，含图修订号为创建后的第二条。
  const revision = await request(environment.getHttpServer())
    .post(`/api/v1/documents/${detail.id}/revisions`)
    .send({
      contentJson: contentOf(...withReference),
      schemaVersion: 1,
      version: await currentVersion(detail.id),
    });
  expect(revision.status).toBe(201);
  const revisionNumber = environment.parseBody<{ revisionNumber: number }>(revision).revisionNumber;
  await saveContent(detail.id, await currentVersion(detail.id), [
    {
      attrs: { blockId: blockIdOf(31) },
      content: [{ text: '无引用', type: 'text' }],
      type: 'paragraph',
    },
  ]);
  expect(await readAttachment(attachment.id)).toEqual({ reference_count: 0, status: 'pending' });
  const restore = await request(environment.getHttpServer())
    .post(`/api/v1/documents/${detail.id}/revisions/${revisionNumber}/restore`)
    .send({ version: await currentVersion(detail.id) });
  expect(restore.status).toBe(200);
  expect(await readAttachment(attachment.id)).toEqual({ reference_count: 1, status: 'active' });
}

/** 用于验证回收站文档保留引用而永久清理递减计数。 */
async function keepsTrashButDecrementsOnPurge(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: '清理库' }]);
  const attachment = await createConfirmedAttachment(environment);
  const id = await createDocumentWith([imageNode(blockIdOf(40), attachment.id)]);
  const trashed = await request(environment.getHttpServer())
    .delete(`/api/v1/documents/${id}`)
    .send({ version: await currentVersion(id) });
  expect(trashed.status).toBe(204);
  expect(await readAttachment(attachment.id)).toEqual({ reference_count: 1, status: 'active' });
  await environment
    .getDatabase()
    .updateTable('documents')
    .set({ deleted_at: new Date(PURGE_NOW.getTime() - 40 * DAY_MS) })
    .where('id', '=', id)
    .execute();
  const stats = await environment.resolveService(TrashPurgeService).purgeExpired(PURGE_NOW);
  expect(stats.purgedDocuments).toBe(1);
  expect(await readAttachment(attachment.id)).toEqual({ reference_count: 0, status: 'pending' });
}

/** 用于验证孤儿清理的 TTL 边界、对象删除与幂等。 */
async function purgesOrphansAtTtlBoundary(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: '孤儿库' }]);
  const expired = await createConfirmedAttachment(environment);
  const fresh = await createConfirmedAttachment(environment);
  const active = await createConfirmedAttachment(environment);
  const documentId = await createDocumentWith([imageNode(blockIdOf(50), active.id)]);
  await ageAttachment(expired.id, 24 * 60 * 60 * 1000 + 1);
  await ageAttachment(fresh.id, 23 * 60 * 60 * 1000);
  const service = environment.resolveService(AttachmentOrphanPurgeService);
  const storage = environment.resolveService(AttachmentStorageProvider);
  const expiredKey = (
    await environment
      .getDatabase()
      .selectFrom('attachments')
      .select('object_key')
      .where('id', '=', expired.id)
      .executeTakeFirstOrThrow()
  ).object_key;
  expect(await storage.readUploadedObject(expiredKey)).toBeDefined();
  const first = await service.purgeExpired(PURGE_NOW);
  expect(first).toEqual({ purgedAttachments: 1 });
  expect(await storage.readUploadedObject(expiredKey)).toBeUndefined();
  expect(await readAttachment(fresh.id)).toMatchObject({ status: 'pending' });
  expect(await readAttachment(active.id)).toMatchObject({ status: 'active' });
  expect(await service.purgeExpired(PURGE_NOW)).toEqual({ purgedAttachments: 0 });
  expect(documentId).toBeDefined();
}

/** 用于验证内部孤儿清理端点的密钥与统计语义。 */
async function guardsInternalOrphanEndpoint(): Promise<void> {
  const rejected = await request(environment.getHttpServer())
    .post('/api/v1/internal/attachment-orphans')
    .send({});
  expect(rejected.status).toBe(401);
  const response = await request(environment.getHttpServer())
    .post('/api/v1/internal/attachment-orphans')
    .set('x-purge-secret', PURGE_SECRET)
    .send({});
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ purgedAttachments: 0 });
}

/** 用于清理测试桶中残留对象。 */
async function cleanupObjects(): Promise<void> {
  const rows = await environment
    .getDatabase()
    .selectFrom('attachments')
    .select('object_key')
    .execute();
  if (rows.length === 0) return;
  const { S3Client, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  const client = new S3Client({
    credentials: { accessKeyId: s3Env!.accessKey, secretAccessKey: s3Env!.secretKey },
    endpoint: s3Env!.endpoint,
    forcePathStyle: true,
    region: s3Env!.region,
  });
  await client.send(
    new DeleteObjectsCommand({
      Bucket: s3Env!.bucket,
      Delete: { Objects: rows.map((row) => ({ Key: row.object_key })) },
    }),
  );
  client.destroy();
}

/** 用于仅在配置数据库与真实 S3 时注册场景。 */
function defineAttachmentLifecycleTests(): void {
  beforeAll(() => environment.prepareApplication(), 30_000);
  beforeEach(() => environment.resetFixtures());
  afterAll(async () => {
    await cleanupObjects();
    await environment.releaseApplication();
  });
  test('tracks references on save', tracksReferencesOnSave);
  test('rejects unknown or foreign references', rejectsUnknownOrForeignReferences);
  test('shares references across documents', sharesReferencesAcrossDocuments);
  test('recalculates on revision restore', recalculatesOnRevisionRestore);
  test('keeps trash but decrements on purge', keepsTrashButDecrementsOnPurge);
  test('purges orphans at ttl boundary', purgesOrphansAtTtlBoundary);
  test('guards the internal orphan endpoint', guardsInternalOrphanEndpoint);
}

describe.skipIf(databaseUrl === undefined || s3Env === undefined)(
  'Attachment lifecycle integration',
  defineAttachmentLifecycleTests,
);
