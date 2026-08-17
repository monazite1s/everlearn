/** @fileoverview 在隔离的真实 PostgreSQL Schema 中验证文档创建与子节点列表行为。 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import type {
  DocumentDetail,
  DocumentListResponse,
  DocumentTreeItem,
} from '@everlearn/contracts' with { 'resolution-mode': 'import' };

import {
  DocumentsTestEnvironment,
  documentDetailKeys,
  otherUserId,
} from '../../tests/documents-integration.support';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(
  `documents_http_${process.pid}`,
  databaseUrl ?? '',
);

/** 用于为知识库夹具生成确定的有效 UUID。 */
function knowledgeBaseId(sequence: number): string {
  return `40000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于为文档夹具生成确定的有效 UUID。 */
function documentId(sequence: number): string {
  return `50000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于返回知识库内文档数量以验证事务回滚。 */
async function countDocuments(knowledgeBase: string): Promise<number> {
  const result = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .where('knowledge_base_id', '=', knowledgeBase)
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

/** 用于提交创建并断言成功状态后返回详情。 */
async function createDocument(knowledgeBase: string, body: object): Promise<DocumentDetail> {
  const response = await request(environment.getHttpServer())
    .post(`/api/v1/knowledge-bases/${knowledgeBase}/documents`)
    .send(body);
  expect(response.status).toBe(201);
  return environment.parseBody<DocumentDetail>(response);
}

/** 用于验证根创建返回严格投影且同事务写入正文与初始修订。 */
async function createsTrimmedRootDocumentWithRevision(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '主库' }]);
  const root = await createDocument(knowledgeBaseId(1), { title: '  根文档  ' });
  expect(Object.keys(root).sort()).toEqual(documentDetailKeys);
  expect(root).toMatchObject({
    childCount: 0,
    knowledgeBaseId: knowledgeBaseId(1),
    parentId: null,
    title: '根文档',
    version: 1,
  });
  expect(Number.isNaN(Date.parse(root.updatedAt))).toBe(false);
  const row = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['path', 'position', 'content_json', 'plain_text', 'schema_version', 'deleted_at'])
    .where('id', '=', root.id)
    .executeTakeFirstOrThrow();
  expect(row).toMatchObject({
    content_json: { content: [], type: 'doc' },
    deleted_at: null,
    path: `/${root.id}`,
    plain_text: '',
    position: '0',
    schema_version: 1,
  });
  const revision = await environment
    .getDatabase()
    .selectFrom('document_revisions')
    .selectAll()
    .where('document_id', '=', root.id)
    .executeTakeFirstOrThrow();
  expect(revision).toMatchObject({
    content_json: { content: [], type: 'doc' },
    created_by: '00000000-0000-4000-8000-000000000001',
    plain_text: '',
    revision_number: 1,
    schema_version: 1,
    source: 'manual',
  });
}

/** 用于验证子文档挂接父路径且同父追加位置递增。 */
async function appendsChildDocumentsWithStablePositions(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '主库' }]);
  const root = await createDocument(knowledgeBaseId(1), { title: '根' });
  const child = await createDocument(knowledgeBaseId(1), { parentId: root.id, title: '子文档' });
  expect(child.parentId).toBe(root.id);
  const childRow = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['path', 'position'])
    .where('id', '=', child.id)
    .executeTakeFirstOrThrow();
  expect(childRow).toEqual({ path: `/${root.id}/${child.id}`, position: '0' });
  const secondRoot = await createDocument(knowledgeBaseId(1), { title: '第二根' });
  const secondChild = await createDocument(knowledgeBaseId(1), {
    parentId: root.id,
    title: '第二子',
  });
  const positions = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['id', 'position'])
    .where('id', 'in', [secondRoot.id, secondChild.id])
    .execute();
  expect(positions).toEqual(
    expect.arrayContaining([
      { id: secondRoot.id, position: '1024' },
      { id: secondChild.id, position: '1024' },
    ]),
  );
}

/** 用于验证并发创建由知识库行锁串行化为互异位置。 */
async function serializesConcurrentRootCreates(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '主库' }]);
  const server = environment.getHttpServer();
  const responses = await Promise.all([
    request(server)
      .post(`/api/v1/knowledge-bases/${knowledgeBaseId(1)}/documents`)
      .send({ title: '并发一' }),
    request(server)
      .post(`/api/v1/knowledge-bases/${knowledgeBaseId(1)}/documents`)
      .send({ title: '并发二' }),
  ]);
  for (const response of responses) expect(response.status).toBe(201);
  const rows = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['id', 'position'])
    .where(
      'id',
      'in',
      responses.map((response) => environment.parseBody<DocumentDetail>(response).id),
    )
    .execute();
  expect(rows.map((row) => row.position).sort()).toEqual(['0', '1024']);
}

/** 用于验证非法父级与范围统一 404 且不留下部分写入。 */
async function rejectsInaccessibleCreateScopes(): Promise<void> {
  await environment.insertOtherUser();
  await environment.insertKnowledgeBases([
    { id: knowledgeBaseId(1), name: '主库' },
    { id: knowledgeBaseId(2), name: '外部库' },
    { id: knowledgeBaseId(3), name: '已删库', deletedAt: new Date() },
    { id: knowledgeBaseId(4), name: '他人库', ownerId: otherUserId },
  ]);
  await environment.insertDocuments([
    {
      id: documentId(1),
      knowledgeBaseId: knowledgeBaseId(1),
      position: 0,
      title: '已删父',
      deleted: true,
    },
    { id: documentId(2), knowledgeBaseId: knowledgeBaseId(2), position: 0, title: '跨库机密' },
    {
      id: documentId(3),
      knowledgeBaseId: knowledgeBaseId(4),
      ownerId: otherUserId,
      position: 0,
      title: '他人机密',
    },
  ]);
  const invalidScopes: readonly [string, object][] = [
    [knowledgeBaseId(1), { parentId: documentId(2), title: '跨库父' }],
    [knowledgeBaseId(1), { parentId: documentId(99), title: '随机父' }],
    [knowledgeBaseId(1), { parentId: documentId(1), title: '已删父' }],
    [knowledgeBaseId(3), { title: '已删库' }],
    [knowledgeBaseId(4), { title: '他人库' }],
    [knowledgeBaseId(99), { title: '随机库' }],
  ];
  for (const [knowledgeBase, body] of invalidScopes) {
    const response = await request(environment.getHttpServer())
      .post(`/api/v1/knowledge-bases/${knowledgeBase}/documents`)
      .send(body);
    const errorBody = environment.expectApiError(
      response,
      404,
      'NOT_FOUND',
      '请求的资源不存在或不可访问。',
    );
    expect(Object.keys(errorBody).sort()).toEqual(['code', 'message', 'requestId']);
    expect(response.text).not.toContain('跨库机密');
    expect(response.text).not.toContain('他人机密');
  }
  expect(await countDocuments(knowledgeBaseId(1))).toBe(1);
}

/** 用于验证非法创建正文、媒体类型被拒绝且不写入。 */
async function rejectsInvalidCreateBodies(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '主库' }]);
  const invalidBodies: readonly object[] = [
    {},
    { title: ' \t\n ' },
    { title: 'x'.repeat(201) },
    { title: 42 },
    { parentId: 'not-a-uuid', title: '非法父' },
    { title: '越权', ownerId: otherUserId },
    { title: '越权', position: 5 },
    { title: '越权', path: '/custom' },
    { title: '越权', knowledgeBaseId: knowledgeBaseId(2) },
    { title: '越权', version: 1 },
  ];
  for (const body of invalidBodies) {
    const response = await request(environment.getHttpServer())
      .post(`/api/v1/knowledge-bases/${knowledgeBaseId(1)}/documents`)
      .send(body);
    environment.expectApiError(response, 400, 'VALIDATION_FAILED', '请求参数校验失败。');
  }
  const nonJson = await request(environment.getHttpServer())
    .post(`/api/v1/knowledge-bases/${knowledgeBaseId(1)}/documents`)
    .set('Content-Type', 'text/plain')
    .send('title=not-json');
  environment.expectApiError(
    nonJson,
    415,
    'UNSUPPORTED_MEDIA_TYPE',
    '请求正文必须使用 application/json。',
  );
  const malformedJson = await request(environment.getHttpServer())
    .post(`/api/v1/knowledge-bases/${knowledgeBaseId(1)}/documents`)
    .set('Content-Type', 'application/json')
    .send('{"title":');
  environment.expectApiError(malformedJson, 400, 'BAD_REQUEST', '请求格式或参数无效。');
  expect(await countDocuments(knowledgeBaseId(1))).toBe(0);
}

/** 用于生成乱序位置夹具以验证按服务端排序分页。 */
async function insertPaginationFixtures(): Promise<string> {
  const root = documentId(1);
  const order = [2, 0, 3, 1, 4].flatMap((offset) => [offset, offset + 5, offset + 10, offset + 15]);
  order.push(20);
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '大树' }]);
  await environment.insertDocuments([
    { id: root, knowledgeBaseId: knowledgeBaseId(1), position: 0, title: '根' },
    ...order.map((rank, index) => ({
      childOf: root,
      deleted: rank === 20,
      id: documentId(index + 2),
      knowledgeBaseId: knowledgeBaseId(1),
      position: rank * 1024,
      title: `子 ${rank}`,
    })),
  ]);
  return root;
}

/** 用于遍历全部游标页并保留服务端返回的分页边界。 */
async function fetchAllChildren(
  root: string,
  limit: number,
): Promise<{ readonly items: DocumentTreeItem[]; readonly pages: number }> {
  const items: DocumentTreeItem[] = [];
  let cursor: string | undefined;
  for (let pages = 1; pages <= 10; pages += 1) {
    const response = await request(environment.getHttpServer())
      .get(`/api/v1/knowledge-bases/${knowledgeBaseId(1)}/documents`)
      .query({ limit, parentId: root, ...(cursor === undefined ? {} : { cursor }) });
    expect(response.status).toBe(200);
    const body = environment.parseBody<DocumentListResponse>(response);
    items.push(...body.items);
    if (body.nextCursor === null) return { items, pages };
    cursor = body.nextCursor;
  }
  throw new Error('Cursor traversal did not terminate');
}

/** 用于验证根/子分层、稳定顺序与软删除子节点排除。 */
async function paginatesDirectChildrenByStableOrder(): Promise<void> {
  const root = await insertPaginationFixtures();
  const rootsResponse = await request(environment.getHttpServer())
    .get(`/api/v1/knowledge-bases/${knowledgeBaseId(1)}/documents`)
    .query({ limit: 100 });
  expect(rootsResponse.status).toBe(200);
  const roots = environment.parseBody<DocumentListResponse>(rootsResponse);
  expect(roots.items.map((item) => item.title)).toEqual(['根']);
  expect(roots.items[0]).toMatchObject({ childCount: 20, version: 1 });
  const result = await fetchAllChildren(root, 5);
  expect(result.pages).toBe(4);
  expect(result.items.map((item) => item.title)).toEqual(
    Array.from({ length: 20 }, (_, rank) => `子 ${rank}`),
  );
  expect(result.items.every((item) => item.childCount === 0)).toBe(true);
}

/** 用于验证列表查询边界被拒绝。 */
async function rejectsInvalidListQueries(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '主库' }]);
  const invalidQueries = [
    { limit: 0 },
    { limit: 101 },
    { limit: 'invalid' },
    { cursor: 'not-a-cursor' },
    { cursor: `${'x'.repeat(20)}=` },
    { parentId: 'not-a-uuid' },
    { unexpected: 'field' },
  ];
  for (const query of invalidQueries) {
    const response = await request(environment.getHttpServer())
      .get(`/api/v1/knowledge-bases/${knowledgeBaseId(1)}/documents`)
      .query(query);
    environment.expectApiError(response, 400, 'VALIDATION_FAILED', '请求参数校验失败。');
  }
}

/** 用于验证不可访问列表范围统一 404。 */
async function rejectsInaccessibleListScopes(): Promise<void> {
  await environment.insertOtherUser();
  const root = documentId(1);
  await environment.insertKnowledgeBases([
    { id: knowledgeBaseId(1), name: '主库' },
    { id: knowledgeBaseId(2), name: '已删库', deletedAt: new Date() },
    { id: knowledgeBaseId(3), name: '他人库', ownerId: otherUserId },
  ]);
  await environment.insertDocuments([
    { id: root, knowledgeBaseId: knowledgeBaseId(1), position: 0 },
    {
      id: documentId(2),
      childOf: root,
      knowledgeBaseId: knowledgeBaseId(1),
      position: 0,
      deleted: true,
    },
  ]);
  const inaccessibleScopes: readonly [string, object][] = [
    [knowledgeBaseId(2), {}],
    [knowledgeBaseId(3), {}],
    [knowledgeBaseId(99), {}],
    [knowledgeBaseId(1), { parentId: documentId(2) }],
  ];
  for (const [knowledgeBase, query] of inaccessibleScopes) {
    const response = await request(environment.getHttpServer())
      .get(`/api/v1/knowledge-bases/${knowledgeBase}/documents`)
      .query(query);
    environment.expectApiError(response, 404, 'NOT_FOUND', '请求的资源不存在或不可访问。');
  }
}

/** 用于仅在配置 PostgreSQL 时注册真实数据库 HTTP 场景。 */
function defineDocumentIntegrationTests(): void {
  beforeAll(() => environment.prepareApplication(), 30_000);
  beforeEach(() => environment.resetFixtures());
  afterAll(() => environment.releaseApplication());
  test(
    'creates trimmed root document with minimal content and revision',
    createsTrimmedRootDocumentWithRevision,
  );
  test(
    'appends child documents with stable parent paths and positions',
    appendsChildDocumentsWithStablePositions,
  );
  test(
    'serializes concurrent root creates into distinct positions',
    serializesConcurrentRootCreates,
  );
  test(
    'rejects inaccessible create scopes without partial writes',
    rejectsInaccessibleCreateScopes,
  );
  test('rejects invalid create bodies and media types', rejectsInvalidCreateBodies);
  test('paginates direct children by stable server order', paginatesDirectChildrenByStableOrder);
  test('rejects invalid list queries', rejectsInvalidListQueries);
  test('rejects inaccessible list scopes', rejectsInaccessibleListScopes);
}

describe.skipIf(databaseUrl === undefined)(
  'Document HTTP integration',
  defineDocumentIntegrationTests,
);
