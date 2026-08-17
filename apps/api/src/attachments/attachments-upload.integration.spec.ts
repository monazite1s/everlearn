/** @fileoverview 在真实 PostgreSQL 与 SeaweedFS 上验证附件两段式上传与授权下载。 */

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import {
  DocumentsTestEnvironment,
  otherUserId,
  type S3FixtureEnv,
} from '../../tests/documents-integration.support';
import {
  blockIdOf,
  confirmUpload,
  createConfirmedAttachment,
  createUpload,
  imageNode,
  objectKeyOf,
  presignAndPut,
  sha256Of,
} from '../../tests/attachments-integration.support';

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
  `attachments_upload_${process.pid}`,
  databaseUrl ?? '',
  s3Env,
);
const IMAGE_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const knowledgeBaseId = 'a0000000-0000-4000-8000-000000000001';

/** 用于创建待保存文档并返回其标识与版本。 */
async function createDocument(): Promise<{ id: string; version: number }> {
  const response = await request(environment.getHttpServer())
    .post(`/api/v1/knowledge-bases/${knowledgeBaseId}/documents`)
    .send({ title: '附件文档' });
  expect(response.status).toBe(201);
  const detail = environment.parseBody<{ id: string; version: number }>(response);
  return { id: detail.id, version: detail.version };
}

/** 用于按夹具配置构造真实 S3 测试客户端。 */
async function createS3Client() {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    credentials: { accessKeyId: s3Env!.accessKey, secretAccessKey: s3Env!.secretKey },
    endpoint: s3Env!.endpoint,
    forcePathStyle: true,
    region: s3Env!.region,
  });
}

/** 用于断言指定附件行已不存在。 */
async function expectRowAbsent(id: string): Promise<void> {
  expect(
    await environment
      .getDatabase()
      .selectFrom('attachments')
      .select('id')
      .where('id', '=', id)
      .executeTakeFirst(),
  ).toBeUndefined();
}

/** 与预检拒绝矩阵镜像的声明、错误码与公开文案清单。 */
const PRECHECK_REJECTIONS: readonly (readonly [object, string, string])[] = [
  [
    { fileName: '大图.png', mimeType: 'image/png', sizeBytes: 10 * 1024 * 1024 + 1 },
    'SIZE_EXCEEDED',
    '文件大小超出允许上限。',
  ],
  [
    { fileName: '大档.pdf', mimeType: 'application/pdf', sizeBytes: 25 * 1024 * 1024 + 1 },
    'SIZE_EXCEEDED',
    '文件大小超出允许上限。',
  ],
  [
    { fileName: '图.svg', mimeType: 'image/svg+xml', sizeBytes: 10 },
    'TYPE_REJECTED',
    '文件类型不在允许范围内。',
  ],
  [
    { fileName: '程序.exe', mimeType: 'application/octet-stream', sizeBytes: 10 },
    'TYPE_REJECTED',
    '文件类型不在允许范围内。',
  ],
  [
    { fileName: '无扩展', mimeType: 'application/octet-stream', sizeBytes: 10 },
    'TYPE_REJECTED',
    '文件类型不在允许范围内。',
  ],
];

/** 用于验证预检成功路径返回带签名约束的直传指令。 */
async function checksPrecheckMatrix(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: '上传库' }]);
  const ok = await createUpload(environment, {
    fileName: '图.png',
    mimeType: 'image/png',
    sizeBytes: 1024,
  });
  expect(ok.status).toBe(201);
  const instruction = environment.parseBody<{
    expiresAt: string;
    headers: object;
    id: string;
    method: string;
    uploadUrl: string;
  }>(ok);
  expect(Object.keys(instruction).sort()).toEqual([
    'expiresAt',
    'headers',
    'id',
    'method',
    'uploadUrl',
  ]);
  expect(instruction.method).toBe('PUT');
  expect(instruction.headers).toEqual({ 'Content-Type': 'image/png' });
  expect(instruction.uploadUrl).toContain('/attachments/');
}

/** 用于验证预检声明拒绝矩阵与 DTO 及媒体类型边界。 */
async function rejectsPrecheckDeclarations(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: '拒绝库' }]);
  for (const [body, code, message] of PRECHECK_REJECTIONS) {
    environment.expectApiError(await createUpload(environment, body), 422, code, message);
  }
  const invalid = await createUpload(environment, { fileName: 'x.png', mimeType: 'image/png' });
  environment.expectApiError(invalid, 400, 'VALIDATION_FAILED', '请求参数校验失败。');
  const nonJson = await request(environment.getHttpServer())
    .post('/api/v1/attachments/uploads')
    .set('Content-Type', 'text/plain')
    .send('x');
  environment.expectApiError(
    nonJson,
    415,
    'UNSUPPORTED_MEDIA_TYPE',
    '请求正文必须使用 application/json。',
  );
}

/** 用于验证直传往返、确认复核、幂等重放与授权下载。 */
async function completesRoundtripAndDownloads(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: '往返库' }]);
  const pending = await presignAndPut(environment, '图.png', 'image/png', IMAGE_BYTES);
  const confirm = await confirmUpload(environment, pending.id, pending.sha256);
  expect(confirm.status).toBe(200);
  const detail = environment.parseBody<{
    fileName: string;
    id: string;
    kind: string;
    referenceCount: number;
    sizeBytes: number;
    status: string;
  }>(confirm);
  expect(detail).toMatchObject({
    fileName: '图.png',
    id: pending.id,
    kind: 'image',
    referenceCount: 0,
    sizeBytes: IMAGE_BYTES.length,
    status: 'pending',
  });
  const replay = await confirmUpload(environment, pending.id, pending.sha256);
  expect(replay.status).toBe(200);
  const download = await request(environment.getHttpServer()).get(
    `/api/v1/attachments/${pending.id}/content`,
  );
  expect(download.status).toBe(200);
  expect(Buffer.compare(download.body as Buffer, IMAGE_BYTES)).toBe(0);
  expect(download.headers['content-type']).toBe('image/png');
  expect(download.headers['content-length']).toBe(String(IMAGE_BYTES.length));
  expect(download.headers['content-disposition']).toContain('inline');
  expect(download.headers['x-content-type-options']).toBe('nosniff');
  const file = await createConfirmedAttachment(
    environment,
    '文档.pdf',
    'application/pdf',
    Buffer.from('%PDF-1.4 stub'),
  );
  const fileDownload = await request(environment.getHttpServer()).get(
    `/api/v1/attachments/${file.id}/content`,
  );
  expect(fileDownload.headers['content-disposition']).toContain('attachment');
}

/** 用于以受控错型对象覆盖预检声明并验证确认拒绝。 */
async function rejectsMismatchedTypeConfirmation(): Promise<void> {
  const replaced = await presignAndPut(environment, '换.png', 'image/png', IMAGE_BYTES);
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const client = await createS3Client();
  await client.send(
    new PutObjectCommand({
      Body: IMAGE_BYTES,
      Bucket: s3Env!.bucket,
      ContentType: 'application/json',
      Key: objectKeyOf(replaced.uploadUrl),
    }),
  );
  environment.expectApiError(
    await confirmUpload(environment, replaced.id, replaced.sha256),
    422,
    'TYPE_REJECTED',
    '文件类型不在允许范围内。',
  );
  await expectRowAbsent(replaced.id);
  client.destroy();
}

/** 用于验证确认前对象缺失、摘要不符与类型不符的失败恢复。 */
async function rejectsFailedConfirmations(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: '确认库' }]);
  const missing = await createUpload(environment, {
    fileName: '缺.png',
    mimeType: 'image/png',
    sizeBytes: 8,
  });
  const missingId = environment.parseBody<{ id: string }>(missing).id;
  environment.expectApiError(
    await confirmUpload(environment, missingId, sha256Of(IMAGE_BYTES)),
    409,
    'OBJECT_MISSING',
    '上传尚未完成，请先完成文件上传。',
  );
  const wrongHash = await presignAndPut(environment, '错.png', 'image/png', IMAGE_BYTES);
  environment.expectApiError(
    await confirmUpload(environment, wrongHash.id, sha256Of(Buffer.from('other'))),
    422,
    'HASH_MISMATCH',
    '文件内容校验失败，请重新上传。',
  );
  await expectRowAbsent(wrongHash.id);
  await rejectsMismatchedTypeConfirmation();
}

/** 用于验证下载与确认端点的所有权不可探测语义。 */
async function hidesOtherOwners(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: '授权库' }]);
  await environment.insertOtherUser();
  const owned = await createConfirmedAttachment(environment);
  const foreignId = 'b0000000-0000-4000-8000-000000000001';
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
      sha256: sha256Of(IMAGE_BYTES),
      size_bytes: 8,
      status: 'pending',
    })
    .execute();
  for (const id of [foreignId, 'c0000000-0000-4000-8000-000000000001']) {
    environment.expectApiError(
      await request(environment.getHttpServer()).get(`/api/v1/attachments/${id}/content`),
      404,
      'NOT_FOUND',
      '请求的资源不存在或不可访问。',
    );
    environment.expectApiError(
      await confirmUpload(environment, id, sha256Of(IMAGE_BYTES)),
      404,
      'NOT_FOUND',
      '请求的资源不存在或不可访问。',
    );
  }
  const ownedDownload = await request(environment.getHttpServer()).get(
    `/api/v1/attachments/${owned.id}/content`,
  );
  expect(ownedDownload.status).toBe(200);
}

/** 用于构造附件节点属性非法的服务端拒绝矩阵。 */
function invalidAttachmentBodies(attachmentId: string): readonly object[] {
  return [
    {
      contentJson: { content: [{ attrs: { blockId: blockIdOf(3) }, type: 'image' }], type: 'doc' },
      schemaVersion: 1,
      version: 2,
    },
    {
      contentJson: { content: [imageNode(blockIdOf(4), 'not-a-uuid')], type: 'doc' },
      schemaVersion: 1,
      version: 2,
    },
    {
      contentJson: {
        content: [imageNode(blockIdOf(5), attachmentId, 'x'.repeat(501))],
        type: 'doc',
      },
      schemaVersion: 1,
      version: 2,
    },
    {
      contentJson: {
        content: [
          {
            attrs: {
              attachmentId,
              blockId: blockIdOf(6),
              fileName: 'y'.repeat(256),
            },
            type: 'attachment',
          },
        ],
        type: 'doc',
      },
      schemaVersion: 1,
      version: 2,
    },
  ];
}

/** 用于验证正文校验器对附件节点属性的服务端矩阵。 */
async function validatesAttachmentNodes(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: '节点库' }]);
  const created = await createDocument();
  const attachment = await createConfirmedAttachment(environment);
  const saved = await request(environment.getHttpServer())
    .patch(`/api/v1/documents/${created.id}/content`)
    .send({
      contentJson: {
        content: [
          imageNode(blockIdOf(1), attachment.id, '截图'),
          {
            attrs: { blockId: blockIdOf(2) },
            content: [{ text: '说明', type: 'text' }],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      },
      schemaVersion: 1,
      version: created.version,
    });
  expect(saved.status).toBe(200);
  for (const body of invalidAttachmentBodies(attachment.id)) {
    const response = await request(environment.getHttpServer())
      .patch(`/api/v1/documents/${created.id}/content`)
      .send(body);
    environment.expectApiError(response, 422, 'UNPROCESSABLE_ENTITY', '请求无法按当前内容处理。');
  }
}

/** 用于清理测试桶中残留对象。 */
async function cleanupObjects(): Promise<void> {
  const rows = await environment
    .getDatabase()
    .selectFrom('attachments')
    .select('object_key')
    .execute();
  if (rows.length === 0) return;
  const { DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  const client = await createS3Client();
  await client.send(
    new DeleteObjectsCommand({
      Bucket: s3Env!.bucket,
      Delete: { Objects: rows.map((row) => ({ Key: row.object_key })) },
    }),
  );
  client.destroy();
}

/** 用于仅在配置数据库与真实 S3 时注册场景。 */
function defineAttachmentUploadTests(): void {
  beforeAll(() => environment.prepareApplication(), 30_000);
  beforeEach(() => environment.resetFixtures());
  afterAll(async () => {
    await cleanupObjects();
    await environment.releaseApplication();
  });
  test('checks the precheck rejection matrix', checksPrecheckMatrix);
  test('rejects invalid precheck declarations', rejectsPrecheckDeclarations);
  test('completes roundtrip and authorized downloads', completesRoundtripAndDownloads);
  test('rejects failed confirmations without retaining rows', rejectsFailedConfirmations);
  test('hides other owners on download and confirm', hidesOtherOwners);
  test('validates attachment node attrs on content save', validatesAttachmentNodes);
}

describe.skipIf(databaseUrl === undefined || s3Env === undefined)(
  'Attachment upload HTTP integration',
  defineAttachmentUploadTests,
);
