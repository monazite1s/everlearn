/** @fileoverview 在隔离的真实 PostgreSQL Schema 中验证 Inbox 转换 HTTP 与事务行为。 */

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import type { DocumentDetail } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import {
  DocumentsTestEnvironment,
  documentDetailKeys,
  expectInitialParagraphContent,
  otherUserId,
} from '../../tests/documents-integration.support';
import { LOCAL_USER_ID } from '../identity/local-identity.constants';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(`inbox_convert_${process.pid}`, databaseUrl ?? '');

/** 用于为知识库夹具生成确定的有效 UUID。 */
function knowledgeBaseId(sequence: number): string {
  return `a0000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于为文档夹具生成确定的有效 UUID。 */
function documentId(sequence: number): string {
  return `b0000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于为 Inbox 夹具生成确定的有效 UUID。 */
function inboxId(sequence: number): string {
  return `90000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

interface InboxFixture {
  readonly content: string;
  readonly convertedDocumentId?: string;
  readonly deleted?: boolean;
  readonly id: string;
  readonly kind: 'text' | 'url';
  readonly ownerId?: string;
  readonly status?: 'converted' | 'pending';
}

/** 用于写入 Inbox 记录夹具并保持创建时间由数据库生成。 */
async function insertInboxItems(fixtures: readonly InboxFixture[]): Promise<void> {
  await environment
    .getDatabase()
    .insertInto('inbox_items')
    .values(
      fixtures.map((fixture) => ({
        content: fixture.content,
        converted_document_id: fixture.convertedDocumentId ?? null,
        deleted_at: fixture.deleted === true ? new Date() : null,
        id: fixture.id,
        kind: fixture.kind,
        owner_id: fixture.ownerId ?? LOCAL_USER_ID,
        status: fixture.status ?? 'pending',
      })),
    )
    .execute();
}

/** 用于发送带指定幂等键的转换请求。 */
function sendConvert(id: string, body: object, idempotencyKey?: string): Promise<request.Response> {
  const pending = request(environment.getHttpServer()).post(`/api/v1/inbox-items/${id}/convert`);
  if (idempotencyKey !== undefined) pending.set('Idempotency-Key', idempotencyKey);
  return pending.send(body);
}

/** 用于读取单条 Inbox 记录的完整数据库状态。 */
async function readInboxRow(id: string) {
  return environment
    .getDatabase()
    .selectFrom('inbox_items')
    .select(['id', 'owner_id', 'kind', 'content', 'status', 'deleted_at', 'converted_document_id'])
    .where('id', '=', id)
    .executeTakeFirst();
}

/** 用于读取可变事实表行数以断言事务无部分写入。 */
async function tableCount(
  table: 'documents' | 'document_revisions' | 'idempotency_records',
): Promise<number> {
  const rows = await environment
    .getDatabase()
    .selectFrom(table)
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  return Number(rows.count);
}

/** 用于写入单个待处理文本记录并返回其标识。 */
async function insertPendingText(sequence: number, content: string): Promise<string> {
  await insertInboxItems([{ content, id: inboxId(sequence), kind: 'text' }]);
  return inboxId(sequence);
}

/** 用于断言记录与初始修订完整承载转换内容。 */
async function expectConvertedDocumentState(
  detail: DocumentDetail,
  expected: { content: string; parentId: string | null; path: string; position: string },
): Promise<void> {
  const documentRow = await environment
    .getDatabase()
    .selectFrom('documents')
    .select([
      'id',
      'owner_id',
      'knowledge_base_id',
      'parent_id',
      'path',
      'position',
      'content_json',
      'plain_text',
    ])
    .where('id', '=', detail.id)
    .executeTakeFirstOrThrow();
  expectInitialParagraphContent(documentRow.content_json, expected.content);
  expect(documentRow).toMatchObject({
    id: detail.id,
    knowledge_base_id: detail.knowledgeBaseId,
    owner_id: LOCAL_USER_ID,
    parent_id: expected.parentId,
    path: expected.path,
    position: expected.position,
    plain_text: expected.content,
  });
  const revision = await environment
    .getDatabase()
    .selectFrom('document_revisions')
    .select(['revision_number', 'source', 'content_json', 'plain_text', 'schema_version'])
    .where('document_id', '=', detail.id)
    .executeTakeFirstOrThrow();
  expect(revision).toMatchObject({
    revision_number: 1,
    schema_version: 1,
    source: 'manual',
    plain_text: expected.content,
  });
  expect(revision.content_json).toEqual(documentRow.content_json);
}

/** 用于验证文本记录被单事务转换为根文档并离开待处理列表。 */
async function convertsTextItemIntoRootDocument(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '主库' }]);
  const id = await insertPendingText(1, '一条待整理的记录');
  const response = await sendConvert(
    id,
    { knowledgeBaseId: knowledgeBaseId(1), title: ' 转换后的标题 ' },
    'convert-root',
  );
  expect(response.status).toBe(201);
  const detail = environment.parseBody<DocumentDetail>(response);
  expect(Object.keys(detail).sort()).toEqual(documentDetailKeys);
  expect(detail).toMatchObject({
    childCount: 0,
    knowledgeBaseId: knowledgeBaseId(1),
    parentId: null,
    title: '转换后的标题',
    version: 1,
  });
  await expectConvertedDocumentState(detail, {
    content: '一条待整理的记录',
    parentId: null,
    path: `/${detail.id}`,
    position: '0',
  });
  expect(await readInboxRow(id)).toMatchObject({
    content: '一条待整理的记录',
    converted_document_id: detail.id,
    deleted_at: null,
    status: 'converted',
  });
  const page = await request(environment.getHttpServer()).get('/api/v1/inbox-items');
  expect(environment.parseBody<{ items: unknown[] }>(page).items).toEqual([]);
}

/** 用于验证 URL 记录只把链接本身写入一段纯文本正文。 */
async function convertsUrlItemWritingOnlyTheLink(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '主库' }]);
  const url = 'https://example.com/post?id=1#frag';
  await insertInboxItems([{ content: url, id: inboxId(1), kind: 'url' }]);
  const response = await sendConvert(
    inboxId(1),
    { knowledgeBaseId: knowledgeBaseId(1), title: '链接标题' },
    'convert-url',
  );
  expect(response.status).toBe(201);
  const detail = environment.parseBody<DocumentDetail>(response);
  await expectConvertedDocumentState(detail, {
    content: url,
    parentId: null,
    path: `/${detail.id}`,
    position: '0',
  });
}

/** 用于验证转换复用 KB-06 的父级校验与末尾追加排序。 */
async function convertsUnderParentWithAppendedPlacement(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '主库' }]);
  await environment.insertDocuments([
    { id: documentId(1), knowledgeBaseId: knowledgeBaseId(1), position: 0, title: '父文档' },
    {
      childOf: documentId(1),
      id: documentId(2),
      knowledgeBaseId: knowledgeBaseId(1),
      position: 512,
      title: '既有子文档',
    },
  ]);
  const id = await insertPendingText(1, '子记录内容');
  const response = await sendConvert(
    id,
    { knowledgeBaseId: knowledgeBaseId(1), parentId: documentId(1), title: '子文档标题' },
    'convert-child',
  );
  expect(response.status).toBe(201);
  const detail = environment.parseBody<DocumentDetail>(response);
  expect(detail.parentId).toBe(documentId(1));
  await expectConvertedDocumentState(detail, {
    content: '子记录内容',
    parentId: documentId(1),
    path: `/${documentId(1)}/${detail.id}`,
    position: '1536',
  });
}

/** 用于验证非法载荷与幂等键在任何写入前被拒绝。 */
async function rejectsInvalidPayloadsWithoutSideEffects(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '主库' }]);
  const id = await insertPendingText(1, '校验失败保留');
  const invalidBodies: readonly object[] = [
    {},
    { title: '标题' },
    { knowledgeBaseId: 'not-a-uuid', title: '标题' },
    { knowledgeBaseId: knowledgeBaseId(1), title: ' \t\n ' },
    { knowledgeBaseId: knowledgeBaseId(1), title: 'x'.repeat(201) },
    { knowledgeBaseId: knowledgeBaseId(1), title: '标题', status: 'pending' },
  ];
  for (const body of invalidBodies) {
    const response = await sendConvert(id, body, 'convert-invalid');
    environment.expectApiError(response, 400, 'VALIDATION_FAILED', '请求参数校验失败。');
  }
  for (const key of ['convert key', 'x'.repeat(201)]) {
    const response = await sendConvert(
      id,
      { knowledgeBaseId: knowledgeBaseId(1), title: '标题' },
      key,
    );
    environment.expectApiError(response, 400, 'BAD_REQUEST', '请求格式或参数无效。');
  }
  const missingKey = await sendConvert(id, { knowledgeBaseId: knowledgeBaseId(1), title: '标题' });
  environment.expectApiError(missingKey, 400, 'BAD_REQUEST', '请求格式或参数无效。');
  expect(await tableCount('documents')).toBe(0);
  expect(await tableCount('idempotency_records')).toBe(0);
  expect(await readInboxRow(id)).toMatchObject({ content: '校验失败保留', status: 'pending' });
}

/** 用于写入验证不可探测 404 的混合 Inbox 夹具。 */
async function insertInaccessibleFixtures(): Promise<void> {
  await environment.insertOtherUser();
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '主库' }]);
  await environment.insertDocuments([
    { id: documentId(1), knowledgeBaseId: knowledgeBaseId(1), position: 0, title: '既有文档' },
  ]);
  await insertInboxItems([
    {
      content: '已转换内容',
      convertedDocumentId: documentId(1),
      id: inboxId(1),
      kind: 'text',
      status: 'converted',
    },
    { content: '已删除内容', deleted: true, id: inboxId(2), kind: 'text' },
    { content: '他人机密', id: inboxId(3), kind: 'text', ownerId: otherUserId },
  ]);
}

/** 用于验证不可访问记录再次转换返回统一 404 且状态不被改动。 */
async function returnsUniform404ForInaccessibleItems(): Promise<void> {
  await insertInaccessibleFixtures();
  const body = { knowledgeBaseId: knowledgeBaseId(1), title: '标题' };
  for (const id of [inboxId(1), inboxId(2), inboxId(3), inboxId(99)]) {
    const response = await sendConvert(id, body, `convert-404-${id}`);
    const errorBody = environment.expectApiError(
      response,
      404,
      'NOT_FOUND',
      '请求的资源不存在或不可访问。',
    );
    expect(Object.keys(errorBody).sort()).toEqual(['code', 'message', 'requestId']);
  }
  expect(await readInboxRow(inboxId(1))).toMatchObject({
    content: '已转换内容',
    converted_document_id: documentId(1),
    deleted_at: null,
    status: 'converted',
  });
  expect(await readInboxRow(inboxId(3))).toMatchObject({ content: '他人机密', status: 'pending' });
  expect(await tableCount('documents')).toBe(1);
  expect(await tableCount('idempotency_records')).toBe(0);
}

/** 用于写入覆盖回收站库、他人库、跨库与已删父级的回滚夹具。 */
async function insertRollbackFixtures(): Promise<void> {
  await environment.insertOtherUser();
  await environment.insertKnowledgeBases([
    { id: knowledgeBaseId(1), name: '主库' },
    { id: knowledgeBaseId(2), name: '回收站库', deletedAt: new Date('2026-08-13T00:00:00Z') },
    { id: knowledgeBaseId(3), name: '他人库', ownerId: otherUserId },
    { id: knowledgeBaseId(4), name: '跨库目标' },
  ]);
  await environment.insertDocuments([
    {
      id: documentId(1),
      deleted: true,
      knowledgeBaseId: knowledgeBaseId(1),
      position: 0,
      title: '已删除父级',
    },
    { id: documentId(2), knowledgeBaseId: knowledgeBaseId(4), position: 0, title: '他库父级' },
  ]);
}

/** 用于验证目标校验失败时整个事务回滚且记录内容保持原样。 */
async function rollsBackWholeTransactionOnInvalidTargets(): Promise<void> {
  await insertRollbackFixtures();
  const id = await insertPendingText(1, '失败不丢内容');
  const invalidTargets: readonly object[] = [
    { knowledgeBaseId: knowledgeBaseId(2), title: '标题' },
    { knowledgeBaseId: knowledgeBaseId(3), title: '标题' },
    { knowledgeBaseId: knowledgeBaseId(1), parentId: documentId(1), title: '标题' },
    { knowledgeBaseId: knowledgeBaseId(1), parentId: documentId(2), title: '标题' },
    { knowledgeBaseId: 'd0000000-0000-4000-8000-000000000001', title: '标题' },
  ];
  for (const body of invalidTargets) {
    const response = await sendConvert(id, body, 'convert-target');
    environment.expectApiError(response, 404, 'NOT_FOUND', '请求的资源不存在或不可访问。');
  }
  expect(await tableCount('documents')).toBe(2);
  expect(await tableCount('document_revisions')).toBe(0);
  expect(await tableCount('idempotency_records')).toBe(0);
  expect(await readInboxRow(id)).toMatchObject({
    content: '失败不丢内容',
    converted_document_id: null,
    deleted_at: null,
    status: 'pending',
  });
}

/** 用于仅在配置 PostgreSQL 时注册真实数据库 HTTP 场景。 */
function defineConversionIntegrationTests(): void {
  beforeAll(() => environment.prepareApplication(), 30_000);
  beforeEach(async () => {
    await environment.getDatabase().deleteFrom('inbox_items').execute();
    await environment.resetFixtures();
  });
  afterAll(() => environment.releaseApplication());
  test(
    'converts a text item into a root document with a paragraph revision',
    convertsTextItemIntoRootDocument,
  );
  test(
    'converts a url item writing only the link as plain text',
    convertsUrlItemWritingOnlyTheLink,
  );
  test('converts under a parent with appended placement', convertsUnderParentWithAppendedPlacement);
  test(
    'rejects invalid payloads and keys without side effects',
    rejectsInvalidPayloadsWithoutSideEffects,
  );
  test('returns uniform 404 for inaccessible items', returnsUniform404ForInaccessibleItems);
  test(
    'rolls back the whole transaction on invalid targets',
    rollsBackWholeTransactionOnInvalidTargets,
  );
}

describe.skipIf(databaseUrl === undefined)(
  'Inbox item conversion HTTP integration',
  defineConversionIntegrationTests,
);
