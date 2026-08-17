/** @fileoverview 在隔离的真实 PostgreSQL Schema 中验证修订创建、列出与预览。 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import type {
  DocumentRevisionDetail,
  DocumentRevisionListResponse,
} from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import { DocumentsTestEnvironment, otherUserId } from '../../tests/documents-integration.support';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(
  `documents_revisions_${process.pid}`,
  databaseUrl ?? '',
);

const REVISION_DETAIL_KEYS = [
  'createdAt',
  'plainText',
  'revisionNumber',
  'schemaVersion',
  'snippet',
  'source',
  'title',
].sort();
const REVISION_ITEM_KEYS = ['createdAt', 'revisionNumber', 'snippet', 'source', 'title'].sort();

/** 用于为知识库夹具生成确定的有效 UUID。 */
function knowledgeBaseId(sequence: number): string {
  return `61000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于为文档夹具生成确定的有效 UUID。 */
function documentId(sequence: number): string {
  return `71000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于按序号生成合法 blockId。 */
function blockIdOf(sequence: number): string {
  return `87000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于构造带唯一 blockId 的单段落正文。 */
function contentOf(sequence: number, text: string) {
  return {
    content: [
      {
        attrs: { blockId: blockIdOf(sequence) },
        content: [{ text, type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  };
}

/** 用于创建待触发修订的文档并返回标识。 */
async function createDocument(title: string): Promise<{ id: string; version: number }> {
  const response = await request(environment.getHttpServer())
    .post(`/api/v1/knowledge-bases/${knowledgeBaseId(1)}/documents`)
    .send({ title });
  expect(response.status).toBe(201);
  const detail = environment.parseBody<{ id: string; version: number }>(response);
  return { id: detail.id, version: detail.version };
}

/** 用于提交一次显式修订创建请求。 */
function postRevision(id: string, body: object) {
  return request(environment.getHttpServer()).post(`/api/v1/documents/${id}/revisions`).send(body);
}

/** 用于提交一次正文保存请求。 */
function saveContent(id: string, body: object) {
  return request(environment.getHttpServer()).patch(`/api/v1/documents/${id}/content`).send(body);
}

/** 用于读取修订列表。 */
function listRevisions(id: string, query = '') {
  return request(environment.getHttpServer()).get(`/api/v1/documents/${id}/revisions${query}`);
}

/** 用于读取修订全文预览。 */
function readRevision(id: string, revisionNumber: string) {
  return request(environment.getHttpServer()).get(
    `/api/v1/documents/${id}/revisions/${revisionNumber}`,
  );
}

/** 用于提交一次修订恢复请求。 */
function restoreRevision(id: string, revisionNumber: string, body: object) {
  return request(environment.getHttpServer())
    .post(`/api/v1/documents/${id}/revisions/${revisionNumber}/restore`)
    .send(body);
}

/** 用于读取按修订号排序的全部修订行。 */
async function revisionRows(id: string) {
  return environment
    .getDatabase()
    .selectFrom('document_revisions')
    .select(['content_json', 'plain_text', 'revision_number', 'schema_version', 'source', 'title'])
    .where('document_id', '=', id)
    .orderBy('revision_number', 'asc')
    .execute();
}

/** 用于验证显式触发创建修订、派生纯文本并默认快照文档标题。 */
async function createsRevisionFromExplicitTrigger(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '修订库' }]);
  const created = await createDocument('原始标题');
  const response = await postRevision(created.id, {
    contentJson: contentOf(1, '修订正文'),
    schemaVersion: 1,
    version: created.version,
  });
  expect(response.status).toBe(201);
  const detail = environment.parseBody<DocumentRevisionDetail>(response);
  expect(Object.keys(detail).sort()).toEqual([...REVISION_DETAIL_KEYS, 'contentJson'].sort());
  expect(detail).toMatchObject({
    plainText: '修订正文',
    revisionNumber: 2,
    schemaVersion: 1,
    snippet: '修订正文',
    source: 'manual',
    title: '原始标题',
  });
  expect(detail.contentJson).toEqual(contentOf(1, '修订正文'));
  const rows = await revisionRows(created.id);
  expect(rows).toHaveLength(2);
  expect(rows[1]).toMatchObject({ plain_text: '修订正文', revision_number: 2, source: 'manual' });
}

/** 用于验证同一触发重复提交不产生重复修订。 */
async function skipsDuplicateSubmissions(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '去重库' }]);
  const created = await createDocument('去重标题');
  const body = {
    contentJson: contentOf(2, '去重正文'),
    schemaVersion: 1,
    title: '快照标题',
    version: created.version,
  };
  const first = await postRevision(created.id, body);
  const replay = await postRevision(created.id, body);
  expect(first.status).toBe(201);
  expect(replay.status).toBe(201);
  const replayed = environment.parseBody<DocumentRevisionDetail>(replay);
  const original = environment.parseBody<DocumentRevisionDetail>(first);
  expect(replayed.revisionNumber).toBe(original.revisionNumber);
  expect(await revisionRows(created.id)).toHaveLength(2);
  const retitled = await postRevision(created.id, {
    contentJson: contentOf(2, '去重正文'),
    schemaVersion: 1,
    title: '新快照标题',
    version: created.version,
  });
  expect(environment.parseBody<DocumentRevisionDetail>(retitled).revisionNumber).toBe(3);
  expect(await revisionRows(created.id)).toHaveLength(3);
}

/** 用于逐个断言非法 DTO 请求体全部被 400 拒绝。 */
async function expectInvalidDtos(id: string): Promise<void> {
  for (const body of [
    {},
    { contentJson: contentOf(3, '缺版本'), schemaVersion: 1 },
    { contentJson: contentOf(3, '缺版本'), schemaVersion: 1, version: 0 },
    { contentJson: contentOf(3, '缺版本'), schemaVersion: 1, version: '1' },
  ]) {
    const invalid = await postRevision(id, body);
    environment.expectApiError(invalid, 400, 'VALIDATION_FAILED', '请求参数校验失败。');
  }
}

/** 用于验证拒绝超前版本、非法正文与非法 DTO。 */
async function rejectsInvalidRevisionSubmissions(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '拒绝库' }]);
  const created = await createDocument('拒绝标题');
  const future = await postRevision(created.id, {
    contentJson: contentOf(3, '超前版本'),
    schemaVersion: 1,
    version: created.version + 5,
  });
  environment.expectApiError(
    future,
    409,
    'VERSION_CONFLICT',
    '资源已被其他操作更新，请刷新后重试。',
  );
  const invalidContent = await postRevision(created.id, {
    contentJson: {
      content: [{ attrs: { blockId: 'not-a-uuid' }, type: 'paragraph' }],
      type: 'doc',
    },
    schemaVersion: 1,
    version: created.version,
  });
  environment.expectApiError(
    invalidContent,
    422,
    'UNPROCESSABLE_ENTITY',
    '请求无法按当前内容处理。',
  );
  const staleSchema = await postRevision(created.id, {
    contentJson: contentOf(3, '旧版本'),
    schemaVersion: 2,
    version: created.version,
  });
  environment.expectApiError(staleSchema, 422, 'UNPROCESSABLE_ENTITY', '请求无法按当前内容处理。');
  await expectInvalidDtos(created.id);
  const nonJson = await request(environment.getHttpServer())
    .post(`/api/v1/documents/${created.id}/revisions`)
    .set('Content-Type', 'text/plain')
    .send('contentJson=not-json');
  environment.expectApiError(
    nonJson,
    415,
    'UNSUPPORTED_MEDIA_TYPE',
    '请求正文必须使用 application/json。',
  );
}

/** 用于验证列表倒序、摘要截断与游标分页。 */
async function listsRevisionsWithCursorPagination(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '列表库' }]);
  const created = await createDocument('列表标题');
  const longText = '长'.repeat(260);
  for (let sequence = 1; sequence <= 3; sequence += 1) {
    const response = await postRevision(created.id, {
      contentJson: contentOf(sequence, longText),
      schemaVersion: 1,
      version: created.version,
    });
    expect(response.status).toBe(201);
  }
  const firstPage = await listRevisions(created.id, '?limit=2');
  expect(firstPage.status).toBe(200);
  const page = environment.parseBody<DocumentRevisionListResponse>(firstPage);
  expect(Object.keys(page).sort()).toEqual(['items', 'nextCursor']);
  expect(page.items.map((item) => item.revisionNumber)).toEqual([4, 3]);
  const firstItem = page.items[0];
  if (firstItem === undefined) throw new Error('Expected a first page item');
  expect(Object.keys(firstItem).sort()).toEqual(REVISION_ITEM_KEYS);
  expect(firstItem.snippet).toBe('长'.repeat(200));
  expect(page.items.every((item) => item.source === 'manual')).toBe(true);
  expect(page.nextCursor).not.toBeNull();
  const secondPage = await listRevisions(created.id, `?limit=2&cursor=${page.nextCursor!}`);
  const tail = environment.parseBody<DocumentRevisionListResponse>(secondPage);
  expect(tail.items.map((item) => item.revisionNumber)).toEqual([2, 1]);
  expect(tail.nextCursor).toBeNull();
  const badCursor = await listRevisions(created.id, '?cursor=not-a-cursor');
  environment.expectApiError(badCursor, 400, 'VALIDATION_FAILED', '请求参数校验失败。');
}

/** 用于验证预览读取全文快照并统一 404 缺失目标。 */
async function readsRevisionDetailAsPreview(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '预览库' }]);
  const created = await createDocument('预览标题');
  await postRevision(created.id, {
    contentJson: contentOf(4, '预览正文'),
    schemaVersion: 1,
    version: created.version,
  });
  const response = await readRevision(created.id, '2');
  expect(response.status).toBe(200);
  const detail = environment.parseBody<DocumentRevisionDetail>(response);
  expect(Object.keys(detail).sort()).toEqual([...REVISION_DETAIL_KEYS, 'contentJson'].sort());
  expect(detail.contentJson).toEqual(contentOf(4, '预览正文'));
  expect(detail.plainText).toBe('预览正文');
  const missing = await readRevision(created.id, '99');
  environment.expectApiError(missing, 404, 'NOT_FOUND', '请求的资源不存在或不可访问。');
  const invalidParam = await readRevision(created.id, '1.5');
  environment.expectApiError(invalidParam, 400, 'VALIDATION_FAILED', '请求参数校验失败。');
}

/** 用于验证修订历史在 HTTP 层不可修改。 */
async function keepsRevisionsImmutableOverHttp(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '不可变库' }]);
  const created = await createDocument('不可变标题');
  await postRevision(created.id, {
    contentJson: contentOf(5, '不可变正文'),
    schemaVersion: 1,
    version: created.version,
  });
  const patch = await request(environment.getHttpServer())
    .patch(`/api/v1/documents/${created.id}/revisions/2`)
    .send({ title: '篡改标题' });
  expect(patch.status).toBe(404);
  const remove = await request(environment.getHttpServer())
    .delete(`/api/v1/documents/${created.id}/revisions/2`)
    .send({ version: 1 });
  expect(remove.status).toBe(404);
  expect(await revisionRows(created.id)).toHaveLength(2);
}

/** 用于验证防抖保存路径本身不创建修订。 */
async function keepsDebouncedSavesRevisionFree(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '防抖库' }]);
  const created = await createDocument('防抖标题');
  for (const sequence of [20, 21]) {
    const response = await saveContent(created.id, {
      contentJson: contentOf(sequence, `防抖 ${sequence}`),
      schemaVersion: 1,
      version: sequence === 20 ? created.version : created.version + 1,
    });
    expect(response.status).toBe(200);
  }
  const list = await listRevisions(created.id);
  const page = environment.parseBody<DocumentRevisionListResponse>(list);
  expect(page.items.map((item) => item.revisionNumber)).toEqual([1]);
}

/** 用于写入其他用户与已删除夹具以验证所有权与生命周期过滤。 */
async function insertInaccessibleFixtures(): Promise<void> {
  await environment.insertOtherUser();
  await environment.insertKnowledgeBases([
    { id: knowledgeBaseId(1), name: '本地库' },
    { id: knowledgeBaseId(2), name: '他人库', ownerId: otherUserId },
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
}

/** 用于验证不可访问目标的修订读取、创建与恢复统一 404。 */
async function hidesInaccessibleRevisionTargets(): Promise<void> {
  await insertInaccessibleFixtures();
  for (const id of [documentId(1), documentId(2), documentId(3), documentId(99)]) {
    const list = await listRevisions(id);
    environment.expectApiError(list, 404, 'NOT_FOUND', '请求的资源不存在或不可访问。');
    const create = await postRevision(id, {
      contentJson: contentOf(6, '越权正文'),
      schemaVersion: 1,
      version: 1,
    });
    environment.expectApiError(create, 404, 'NOT_FOUND', '请求的资源不存在或不可访问。');
    const preview = await readRevision(id, '1');
    environment.expectApiError(preview, 404, 'NOT_FOUND', '请求的资源不存在或不可访问。');
    const restore = await restoreRevision(id, '1', { version: 1 });
    environment.expectApiError(restore, 404, 'NOT_FOUND', '请求的资源不存在或不可访问。');
  }
}

/** 用于仅在配置 PostgreSQL 时注册真实数据库 HTTP 场景。 */
function defineDocumentRevisionIntegrationTests(): void {
  beforeAll(() => environment.prepareApplication(), 30_000);
  beforeEach(() => environment.resetFixtures());
  afterAll(() => environment.releaseApplication());
  test(
    'creates revision from explicit trigger with derived plain text',
    createsRevisionFromExplicitTrigger,
  );
  test('skips duplicate submissions without new revisions', skipsDuplicateSubmissions);
  test('rejects invalid revision submissions', rejectsInvalidRevisionSubmissions);
  test('lists revisions newest first with cursor pagination', listsRevisionsWithCursorPagination);
  test('reads revision detail as restore preview', readsRevisionDetailAsPreview);
  test('keeps revisions immutable over HTTP', keepsRevisionsImmutableOverHttp);
  test('keeps debounced saves revision free', keepsDebouncedSavesRevisionFree);
  test('hides inaccessible revision targets', hidesInaccessibleRevisionTargets);
}

describe.skipIf(databaseUrl === undefined)(
  'Document revision HTTP integration',
  defineDocumentRevisionIntegrationTests,
);
