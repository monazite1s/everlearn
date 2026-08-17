/** @fileoverview 验证确认复核的并发竞态与被引用附件的失败保留语义。 */

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import {
  confirmUpload,
  presignAndPut,
  sha256Of,
} from '../../tests/attachments-integration.support';
import { DocumentsTestEnvironment } from '../../tests/documents-integration.support';

const databaseUrl = process.env.DATABASE_URL;
const s3Env =
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
  `attachments_race_${process.pid}`,
  databaseUrl ?? '',
  s3Env,
);
const IMAGE_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 8, 7]);
const knowledgeBaseId = 'b0000000-0000-4000-8000-000000000001';

/** 用于创建引用指定附件节点的文档并保存正文。 */
async function saveDocumentReferencing(attachmentId: string): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: '引用库' }]);
  const created = await request(environment.getHttpServer())
    .post(`/api/v1/knowledge-bases/${knowledgeBaseId}/documents`)
    .send({ title: '引用文档' });
  expect(created.status).toBe(201);
  const documentId = environment.parseBody<{ id: string; version: number }>(created).id;
  const saved = await request(environment.getHttpServer())
    .patch(`/api/v1/documents/${documentId}/content`)
    .send({
      contentJson: {
        content: [
          {
            attrs: { alt: '图', attachmentId, blockId: crypto.randomUUID() },
            type: 'image',
          },
        ],
        type: 'doc',
      },
      schemaVersion: 1,
      version: 1,
    });
  expect(saved.status).toBe(200);
}

/** 用于读取附件行的引用计数与哈希。 */
async function readRow(id: string): Promise<{ count: number; sha: string | null }> {
  const row = await environment
    .getDatabase()
    .selectFrom('attachments')
    .select(['reference_count', 'sha256'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
  return { count: row.reference_count, sha: row.sha256 };
}

/** 用于验证并发确认中正确哈希胜出且对象不被破坏。 */
async function resolvesConcurrentConfirmWithCorrectHash(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: '竞态库' }]);
  const uploaded = await presignAndPut(environment, '竞.png', 'image/png', IMAGE_BYTES);
  const correct = confirmUpload(environment, uploaded.id, sha256Of(IMAGE_BYTES));
  const wrong = confirmUpload(environment, uploaded.id, sha256Of(Buffer.from('bad')));
  const [correctResult, wrongResult] = await Promise.all([correct, wrong]);
  expect([correctResult.status, wrongResult.status].sort()).toEqual([200, 422]);
  const row = await readRow(uploaded.id);
  expect(row.count).toBe(0);
  expect(row.sha).toBe(sha256Of(IMAGE_BYTES));
}

/** 用于验证被引用的 pending 附件确认失败时保留行不产生悬空引用。 */
async function keepsReferencedAttachmentOnFailedConfirm(): Promise<void> {
  const uploaded = await presignAndPut(environment, '引.png', 'image/png', IMAGE_BYTES);
  await saveDocumentReferencing(uploaded.id);
  expect((await readRow(uploaded.id)).count).toBe(1);

  const failed = await confirmUpload(environment, uploaded.id, sha256Of(Buffer.from('mismatch')));
  expect(failed.status).toBe(422);
  const row = await readRow(uploaded.id);
  expect(row.count).toBe(1);
  expect(row.sha).toBeNull();
}

/** 用于仅在数据库与 S3 环境可用时注册场景。 */
function defineConfirmRaceTests(): void {
  beforeAll(() => environment.prepareApplication(), 30_000);
  beforeEach(() => environment.resetFixtures());
  afterAll(() => environment.releaseApplication());
  test(
    'resolves concurrent confirms with the correct hash winning',
    resolvesConcurrentConfirmWithCorrectHash,
  );
  test(
    'keeps a referenced attachment row when confirmation fails',
    keepsReferencedAttachmentOnFailedConfirm,
  );
}

describe.skipIf(databaseUrl === undefined || s3Env === undefined)(
  'Attachment confirmation races',
  defineConfirmRaceTests,
);
