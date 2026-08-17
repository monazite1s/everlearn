/** @fileoverview 在隔离的真实 PostgreSQL Schema 中验证正文保存校验与版本冲突。 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import type { DocumentContentDetail } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import {
  DocumentsTestEnvironment,
  documentDetailKeys,
  otherUserId,
} from '../../tests/documents-integration.support';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(
  `documents_content_${process.pid}`,
  databaseUrl ?? '',
);

/** 用于断言内容投影的字段全集。 */
const contentDetailKeys = ['contentJson', 'schemaVersion', ...documentDetailKeys].sort();

const HEADING_ID = '44444444-4444-4444-8444-444444444444';
const PARAGRAPH_ID = '55555555-5555-4555-8555-555555555555';
const RIVAL_ID = '66666666-6666-4666-8666-666666666666';

/** 用于构造两块合法正文并保留确定的派生纯文本。 */
const SAVED_CONTENT = {
  content: [
    {
      attrs: { blockId: HEADING_ID, level: 2 },
      content: [{ text: '标题块', type: 'text' }],
      type: 'heading',
    },
    {
      attrs: { blockId: PARAGRAPH_ID },
      content: [
        { marks: [{ type: 'bold' }], text: '第一段', type: 'text' },
        { type: 'hardBreak' },
        {
          marks: [{ attrs: { href: 'https://example.com' }, type: 'link' }],
          text: '第二行',
          type: 'text',
        },
      ],
      type: 'paragraph',
    },
  ],
  type: 'doc',
};
const SAVED_PLAIN_TEXT = '标题块\n\n第一段\n第二行';

/** 用于为知识库夹具生成确定的有效 UUID。 */
function knowledgeBaseId(sequence: number): string {
  return `60000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于为文档夹具生成确定的有效 UUID。 */
function documentId(sequence: number): string {
  return `70000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于按序号生成合法 blockId。 */
function blockIdOf(sequence: number): string {
  return `88888888-8888-4888-8888-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于构造块引用嵌套到指定深度的正文。 */
function nestedToDepth(depth: number): Record<string, unknown> {
  let node: Record<string, unknown> = {
    attrs: { blockId: blockIdOf(900) },
    content: [{ text: '深', type: 'text' }],
    type: 'paragraph',
  };
  for (let level = 0; level < depth; level += 1) {
    node = { attrs: { blockId: blockIdOf(level) }, content: [node], type: 'blockquote' };
  }
  return { content: [node], type: 'doc' };
}

/** 用于写入其他用户与其知识库以验证所有权过滤。 */
async function insertOtherUserKnowledgeBase(): Promise<void> {
  await environment.insertOtherUser();
  await environment.insertKnowledgeBases([
    { id: knowledgeBaseId(2), name: '他人库', ownerId: otherUserId },
  ]);
}

/** 用于创建待保存文档并返回其标识。 */
async function createDocument(): Promise<{ id: string; version: number }> {
  const response = await request(environment.getHttpServer())
    .post(`/api/v1/knowledge-bases/${knowledgeBaseId(1)}/documents`)
    .send({ title: '原始标题' });
  expect(response.status).toBe(201);
  const detail = environment.parseBody<{ id: string; version: number }>(response);
  return { id: detail.id, version: detail.version };
}

/** 用于提交一次正文保存请求。 */
function saveContent(id: string, body: object) {
  return request(environment.getHttpServer()).patch(`/api/v1/documents/${id}/content`).send(body);
}

/** 用于读取文档内容投影。 */
function readContent(id: string) {
  return request(environment.getHttpServer()).get(`/api/v1/documents/${id}/content`);
}

/** 用于验证保存成功推进版本、派生纯文本且读取可恢复内容与 blockId。 */
async function savesContentAndDerivesPlainText(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '保存库' }]);
  const created = await createDocument();
  const response = await saveContent(created.id, {
    contentJson: SAVED_CONTENT,
    schemaVersion: 1,
    version: created.version,
  });
  expect(response.status).toBe(200);
  const saved = environment.parseBody<DocumentContentDetail>(response);
  expect(Object.keys(saved).sort()).toEqual(contentDetailKeys);
  expect(saved).toMatchObject({ id: created.id, schemaVersion: 1, title: '原始标题', version: 2 });
  expect(saved.contentJson).toEqual(SAVED_CONTENT);
  const row = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['plain_text', 'schema_version', 'version', 'content_json'])
    .where('id', '=', created.id)
    .executeTakeFirstOrThrow();
  expect(row).toMatchObject({ plain_text: SAVED_PLAIN_TEXT, schema_version: 1, version: 2 });
  expect(row.content_json).toEqual(SAVED_CONTENT);
  const refetched = await readContent(created.id);
  expect(refetched.status).toBe(200);
  const restored = environment.parseBody<DocumentContentDetail>(refetched);
  expect(restored.contentJson).toEqual(SAVED_CONTENT);
  expect(restored).toMatchObject({ schemaVersion: 1, version: 2 });
  const detail = await request(environment.getHttpServer()).get(`/api/v1/documents/${created.id}`);
  expect(Object.keys(environment.parseBody<DocumentContentDetail>(detail)).sort()).toEqual(
    documentDetailKeys,
  );
}

/** 用于验证随正文一并提交的标题在统一版本域内更新。 */
async function appliesTitleTogetherWithContent(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '标题库' }]);
  const created = await createDocument();
  const response = await saveContent(created.id, {
    contentJson: SAVED_CONTENT,
    schemaVersion: 1,
    title: '  新标题  ',
    version: created.version,
  });
  expect(response.status).toBe(200);
  expect(environment.parseBody<DocumentContentDetail>(response)).toMatchObject({
    title: '新标题',
    version: 2,
  });
}

/** 用于构造带任意 blockId 的段落节点。 */
function paragraphOf(blockId: unknown) {
  return {
    attrs: { blockId },
    content: [{ text: '文本', type: 'text' }],
    type: 'paragraph',
  };
}

/** 与客户端解析器拒绝矩阵镜像的服务端非法正文清单。 */
const INVALID_CONTENT_BODIES: readonly object[] = [
  [],
  { type: 'paragraph' },
  { content: {}, type: 'doc' },
  { content: [{ type: 'taskList' }], type: 'doc' },
  { content: [paragraphOf(undefined)], type: 'doc' },
  { content: [paragraphOf('not-a-uuid')], type: 'doc' },
  { content: [paragraphOf(HEADING_ID), paragraphOf(HEADING_ID)], type: 'doc' },
  {
    content: [{ attrs: { blockId: HEADING_ID, level: 5 }, content: [], type: 'heading' }],
    type: 'doc',
  },
  {
    content: [
      {
        attrs: { blockId: PARAGRAPH_ID },
        content: [{ text: 5, type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  },
  {
    content: [
      {
        attrs: { blockId: PARAGRAPH_ID },
        content: [{ marks: [{ type: 'highlight' }], text: 'x', type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  },
  nestedToDepth(66),
];

/** 用于验证非法正文一律 422 且不改变已存内容。 */
async function rejectsInvalidContentBodies(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '拒绝库' }]);
  const created = await createDocument();
  for (const contentJson of INVALID_CONTENT_BODIES) {
    const response = await saveContent(created.id, {
      contentJson,
      schemaVersion: 1,
      version: created.version,
    });
    environment.expectApiError(response, 422, 'UNPROCESSABLE_ENTITY', '请求无法按当前内容处理。');
  }
  const staleSchema = await saveContent(created.id, {
    contentJson: nestedToDepth(60),
    schemaVersion: 2,
    version: created.version,
  });
  environment.expectApiError(staleSchema, 422, 'UNPROCESSABLE_ENTITY', '请求无法按当前内容处理。');
  const row = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['content_json', 'plain_text', 'version'])
    .where('id', '=', created.id)
    .executeTakeFirstOrThrow();
  expect(row).toMatchObject({
    content_json: { content: [], type: 'doc' },
    plain_text: '',
    version: 1,
  });
}

/** 用于验证合法深度边界内嵌套正文仍可保存。 */
async function acceptsDeepButBoundedContent(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '深度库' }]);
  const created = await createDocument();
  const response = await saveContent(created.id, {
    contentJson: nestedToDepth(60),
    schemaVersion: 1,
    version: created.version,
  });
  expect(response.status).toBe(200);
  expect(environment.parseBody<DocumentContentDetail>(response).version).toBe(2);
}

/** 用于验证版本冲突保留胜出内容且拒绝方内容不落库。 */
async function keepsWinningVersionOnConflict(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '冲突库' }]);
  const created = await createDocument();
  const winner = await saveContent(created.id, {
    contentJson: SAVED_CONTENT,
    schemaVersion: 1,
    version: created.version,
  });
  expect(winner.status).toBe(200);
  const rivalContent = {
    content: [
      {
        attrs: { blockId: RIVAL_ID },
        content: [{ text: '竞争内容', type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  };
  const stale = await saveContent(created.id, {
    contentJson: rivalContent,
    schemaVersion: 1,
    version: created.version,
  });
  environment.expectApiError(
    stale,
    409,
    'VERSION_CONFLICT',
    '资源已被其他操作更新，请刷新后重试。',
  );
  const refetched = await readContent(created.id);
  const restored = environment.parseBody<DocumentContentDetail>(refetched);
  expect(restored.contentJson).toEqual(SAVED_CONTENT);
  expect(restored).toMatchObject({ title: '原始标题', version: 2 });
}

/** 用于验证并发保存同一版本恰好一胜一冲突且落库结果确定。 */
async function resolvesConcurrentSavesWithSingleWinner(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '并发库' }]);
  const created = await createDocument();
  /** 用于构造并发保存的单块正文请求体。 */
  const buildBody = (blockId: string, text: string) => ({
    contentJson: {
      content: [{ attrs: { blockId }, content: [{ text, type: 'text' }], type: 'paragraph' }],
      type: 'doc',
    },
    schemaVersion: 1,
    version: created.version,
  });
  const [first, second] = await Promise.all([
    saveContent(created.id, buildBody(HEADING_ID, '并发一')),
    saveContent(created.id, buildBody(PARAGRAPH_ID, '并发二')),
  ]);
  const statuses = [first.status, second.status].sort();
  expect(statuses).toEqual([200, 409]);
  const row = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['plain_text', 'version'])
    .where('id', '=', created.id)
    .executeTakeFirstOrThrow();
  expect(row.version).toBe(2);
  expect(['并发一', '并发二']).toContain(row.plain_text);
}

/** 用于验证 DTO 校验失败与媒体类型边界。 */
async function rejectsInvalidSaveDtos(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: 'DTO 库' }]);
  const created = await createDocument();
  const invalidBodies: readonly object[] = [
    {},
    { version: 1 },
    { contentJson: SAVED_CONTENT, version: 1 },
    { contentJson: SAVED_CONTENT, schemaVersion: 1 },
    { contentJson: null, schemaVersion: 1, version: 1 },
    { contentJson: SAVED_CONTENT, schemaVersion: 1.5, version: 1 },
    { contentJson: SAVED_CONTENT, schemaVersion: 0, version: 1 },
    { contentJson: SAVED_CONTENT, schemaVersion: 1, title: ' ', version: 1 },
    { contentJson: SAVED_CONTENT, schemaVersion: 1, title: 'x'.repeat(201), version: 1 },
    { contentJson: SAVED_CONTENT, schemaVersion: 1, version: 0 },
    { contentJson: SAVED_CONTENT, schemaVersion: 1, version: '1' },
    { contentJson: SAVED_CONTENT, schemaVersion: 1, version: 1, ownerId: otherUserId },
  ];
  for (const body of invalidBodies) {
    const response = await saveContent(created.id, body);
    environment.expectApiError(response, 400, 'VALIDATION_FAILED', '请求参数校验失败。');
  }
  const nonJson = await request(environment.getHttpServer())
    .patch(`/api/v1/documents/${created.id}/content`)
    .set('Content-Type', 'text/plain')
    .send('contentJson=not-json');
  environment.expectApiError(
    nonJson,
    415,
    'UNSUPPORTED_MEDIA_TYPE',
    '请求正文必须使用 application/json。',
  );
}

/** 用于验证不可访问目标的读取与保存统一 404。 */
async function rejectsInaccessibleContentTargets(): Promise<void> {
  await insertOtherUserKnowledgeBase();
  await environment.insertKnowledgeBases([
    { id: knowledgeBaseId(1), name: '本地库' },
    { deletedAt: new Date('2026-08-13T00:00:00Z'), id: knowledgeBaseId(3), name: '软删库' },
  ]);
  await environment.insertDocuments([
    {
      id: documentId(1),
      knowledgeBaseId: knowledgeBaseId(1),
      position: 0,
      title: '已删文档',
      deleted: true,
    },
    {
      id: documentId(2),
      knowledgeBaseId: knowledgeBaseId(2),
      ownerId: otherUserId,
      position: 0,
      title: '他人机密',
    },
    { id: documentId(3), knowledgeBaseId: knowledgeBaseId(3), position: 0 },
  ]);
  for (const id of [documentId(1), documentId(2), documentId(3), documentId(99)]) {
    const body = { contentJson: SAVED_CONTENT, schemaVersion: 1, version: 1 };
    const patch = await saveContent(id, body);
    environment.expectApiError(patch, 404, 'NOT_FOUND', '请求的资源不存在或不可访问。');
    const get = await readContent(id);
    environment.expectApiError(get, 404, 'NOT_FOUND', '请求的资源不存在或不可访问。');
  }
}

/** 用于仅在配置 PostgreSQL 时注册真实数据库 HTTP 场景。 */
function defineDocumentContentIntegrationTests(): void {
  beforeAll(() => environment.prepareApplication(), 30_000);
  beforeEach(() => environment.resetFixtures());
  afterAll(() => environment.releaseApplication());
  test('saves content with derived plain text and restores it', savesContentAndDerivesPlainText);
  test('applies optional title together with content', appliesTitleTogetherWithContent);
  test('rejects invalid content bodies without mutation', rejectsInvalidContentBodies);
  test('accepts deep but bounded content', acceptsDeepButBoundedContent);
  test('keeps winning version on conflict', keepsWinningVersionOnConflict);
  test('resolves concurrent saves with a single winner', resolvesConcurrentSavesWithSingleWinner);
  test('rejects invalid save DTOs and media types', rejectsInvalidSaveDtos);
  test('hides inaccessible content targets', rejectsInaccessibleContentTargets);
}

describe.skipIf(databaseUrl === undefined)(
  'Document content save HTTP integration',
  defineDocumentContentIntegrationTests,
);
