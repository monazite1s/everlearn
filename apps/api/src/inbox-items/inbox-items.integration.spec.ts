/** @fileoverview 在隔离的真实 PostgreSQL Schema 中验证 Inbox 记录 HTTP 行为。 */

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import type { InboxItemListResponse, InboxItemSummary } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import { DocumentsTestEnvironment, otherUserId } from '../../tests/documents-integration.support';
import { LOCAL_USER_ID } from '../identity/local-identity.constants';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(
  `inbox_items_http_${process.pid}`,
  databaseUrl ?? '',
);
const BASE_TIME = Date.parse('2026-08-17T08:00:00.000Z');

interface InboxFixture {
  readonly content: string;
  readonly convertedDocumentId?: string;
  readonly createdAt: Date;
  readonly deleted?: boolean;
  readonly id: string;
  readonly kind: 'text' | 'url';
  readonly ownerId?: string;
  readonly status?: 'converted' | 'pending';
}

/** 用于为 Inbox 夹具生成确定的有效 UUID。 */
function inboxId(sequence: number): string {
  return `90000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于为转换目标夹具生成确定的有效 UUID。 */
function knowledgeBaseId(): string {
  return '70000000-0000-4000-8000-000000000001';
}

/** 用于为转换目标夹具生成确定的有效 UUID。 */
function documentId(): string {
  return '80000000-0000-4000-8000-000000000001';
}

/** 用于按序号生成递增的固定创建时间。 */
function createdAtAt(step: number): Date {
  return new Date(BASE_TIME + step * 60_000);
}

/** 用于写入控制时间、状态与所有权的 Inbox 记录夹具。 */
async function insertInboxItems(fixtures: readonly InboxFixture[]): Promise<void> {
  await environment
    .getDatabase()
    .insertInto('inbox_items')
    .values(
      fixtures.map((fixture) => ({
        content: fixture.content,
        converted_document_id: fixture.convertedDocumentId ?? null,
        created_at: fixture.createdAt,
        deleted_at: fixture.deleted === true ? new Date() : null,
        id: fixture.id,
        kind: fixture.kind,
        owner_id: fixture.ownerId ?? LOCAL_USER_ID,
        status: fixture.status ?? 'pending',
        updated_at: fixture.createdAt,
      })),
    )
    .execute();
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

/** 用于以查询参数读取待处理列表并断言成功。 */
async function listItems(query: Record<string, unknown> = {}): Promise<InboxItemListResponse> {
  const response = await request(environment.getHttpServer())
    .get('/api/v1/inbox-items')
    .query(query);
  expect(response.status).toBe(200);
  return environment.parseBody<InboxItemListResponse>(response);
}

/** 用于验证不依赖任何知识库即可记录文本与 URL。 */
async function createsItemsWithoutKnowledgeBases(): Promise<void> {
  const textResponse = await request(environment.getHttpServer())
    .post('/api/v1/inbox-items')
    .send({ text: '  一条快速记录  ' });
  expect(textResponse.status).toBe(201);
  const textItem = environment.parseBody<InboxItemSummary>(textResponse);
  expect(Object.keys(textItem).sort()).toEqual(['content', 'createdAt', 'id', 'kind']);
  expect(textItem).toMatchObject({ content: '一条快速记录', kind: 'text' });
  expect(Number.isNaN(Date.parse(textItem.createdAt))).toBe(false);
  const urlResponse = await request(environment.getHttpServer())
    .post('/api/v1/inbox-items')
    .send({ url: '  https://example.com/post?x=1  ' });
  expect(urlResponse.status).toBe(201);
  const urlItem = environment.parseBody<InboxItemSummary>(urlResponse);
  expect(urlItem).toMatchObject({ content: 'https://example.com/post?x=1', kind: 'url' });
  for (const item of [textItem, urlItem]) {
    expect(await readInboxRow(item.id)).toMatchObject({
      content: item.content,
      converted_document_id: null,
      deleted_at: null,
      kind: item.kind,
      owner_id: LOCAL_USER_ID,
      status: 'pending',
    });
  }
}

/** 用于验证混合、缺失、非法载荷被拒绝且不写入。 */
async function rejectsInvalidCreatePayloads(): Promise<void> {
  const invalidBodies: readonly object[] = [
    {},
    { text: '文字', url: 'https://example.com' },
    { text: ' \t\n ' },
    { text: 'x'.repeat(10_001) },
    { url: 'ftp://example.com/file' },
    { url: 'example.com/missing-scheme' },
    { url: 42 },
    { text: '越权', ownerId: otherUserId },
    { text: '越权', status: 'pending' },
    { text: '越权', kind: 'url' },
  ];
  for (const body of invalidBodies) {
    const response = await request(environment.getHttpServer())
      .post('/api/v1/inbox-items')
      .send(body);
    environment.expectApiError(response, 400, 'VALIDATION_FAILED', '请求参数校验失败。');
  }
  const nonJson = await request(environment.getHttpServer())
    .post('/api/v1/inbox-items')
    .set('Content-Type', 'text/plain')
    .send('text=not-json');
  environment.expectApiError(
    nonJson,
    415,
    'UNSUPPORTED_MEDIA_TYPE',
    '请求正文必须使用 application/json。',
  );
  const malformedJson = await request(environment.getHttpServer())
    .post('/api/v1/inbox-items')
    .set('Content-Type', 'application/json')
    .send('{"text":');
  environment.expectApiError(malformedJson, 400, 'BAD_REQUEST', '请求格式或参数无效。');
  const count = await environment
    .getDatabase()
    .selectFrom('inbox_items')
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  expect(Number(count.count)).toBe(0);
}

/** 用于写入验证所有权、状态与软删除过滤的混合夹具。 */
async function insertVisibilityFixtures(): Promise<void> {
  await environment.insertOtherUser();
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(), name: '主库' }]);
  await environment.insertDocuments([
    { id: documentId(), knowledgeBaseId: knowledgeBaseId(), position: 0, title: '转换目标' },
  ]);
  await insertInboxItems([
    { content: '最旧', createdAt: createdAtAt(0), id: inboxId(1), kind: 'text' },
    { content: '第二', createdAt: createdAtAt(1), id: inboxId(2), kind: 'text' },
    { content: '并列三', createdAt: createdAtAt(2), id: inboxId(3), kind: 'text' },
    { content: '并列四', createdAt: createdAtAt(2), id: inboxId(4), kind: 'text' },
    {
      content: 'https://example.com/latest',
      createdAt: createdAtAt(3),
      id: inboxId(5),
      kind: 'url',
    },
    {
      content: '已转换内容',
      convertedDocumentId: documentId(),
      createdAt: createdAtAt(4),
      id: inboxId(6),
      kind: 'text',
      status: 'converted',
    },
    {
      content: '已删除内容',
      createdAt: createdAtAt(5),
      deleted: true,
      id: inboxId(7),
      kind: 'text',
    },
    {
      content: '他人机密一',
      createdAt: createdAtAt(6),
      id: inboxId(8),
      kind: 'text',
      ownerId: otherUserId,
    },
    {
      content: 'https://example.com/other',
      createdAt: createdAtAt(7),
      id: inboxId(9),
      kind: 'url',
      ownerId: otherUserId,
    },
  ]);
}

/** 用于验证列表只含当前所有者的待处理记录且按稳定序排列。 */
async function listsOnlyOwnPendingItemsByStableOrder(): Promise<void> {
  await insertVisibilityFixtures();
  const page = await listItems();
  expect(page.nextCursor).toBeNull();
  expect(page.items.map((item) => item.id)).toEqual([
    inboxId(5),
    inboxId(3),
    inboxId(4),
    inboxId(2),
    inboxId(1),
  ]);
  expect(page.items[0]).toMatchObject({ content: 'https://example.com/latest', kind: 'url' });
  const serialized = JSON.stringify(page);
  expect(serialized).not.toContain('已转换内容');
  expect(serialized).not.toContain('已删除内容');
  expect(serialized).not.toContain('他人机密');
  expect(serialized).not.toContain('otherUserId');
}

/** 用于写入七条递创建时间的待处理分页夹具。 */
async function insertPaginationFixtures(): Promise<void> {
  await insertInboxItems(
    Array.from({ length: 7 }, (_, step) => ({
      content: `记录 ${step}`,
      createdAt: createdAtAt(step),
      id: inboxId(step + 1),
      kind: 'text' as const,
    })),
  );
}

/** 用于遍历全部游标页并返回顺序聚合的结果。 */
async function fetchAllPages(limit: number): Promise<InboxItemSummary[]> {
  const items: InboxItemSummary[] = [];
  let cursor: string | undefined;
  for (let pages = 1; pages <= 10; pages += 1) {
    const page = await listItems({ ...(cursor === undefined ? {} : { cursor }), limit });
    items.push(...page.items);
    if (page.nextCursor === null) return items;
    cursor = page.nextCursor;
  }
  throw new Error('Cursor traversal did not terminate');
}

/** 用于验证游标分页覆盖全部待处理记录且不重复。 */
async function paginatesPendingItemsWithCursorTraversal(): Promise<void> {
  await insertPaginationFixtures();
  const firstPage = await listItems({ limit: 3 });
  expect(firstPage.items.map((item) => item.content)).toEqual(['记录 6', '记录 5', '记录 4']);
  expect(firstPage.nextCursor).not.toBeNull();
  const items = await fetchAllPages(3);
  expect(items.map((item) => item.content)).toEqual(
    Array.from({ length: 7 }, (_, step) => `记录 ${6 - step}`),
  );
  expect(new Set(items.map((item) => item.id)).size).toBe(7);
}

/** 用于验证同一创建时间的记录在页边界不重复且不丢失。 */
async function paginatesAcrossCreatedAtTies(): Promise<void> {
  await insertInboxItems([
    { content: '最新', createdAt: createdAtAt(3), id: inboxId(1), kind: 'text' },
    { content: '并列一', createdAt: createdAtAt(1), id: inboxId(2), kind: 'text' },
    { content: '并列二', createdAt: createdAtAt(1), id: inboxId(3), kind: 'text' },
    { content: '更早', createdAt: createdAtAt(0), id: inboxId(4), kind: 'text' },
  ]);
  const firstPage = await listItems({ limit: 2 });
  expect(firstPage.items.map((item) => item.content)).toEqual(['最新', '并列一']);
  expect(firstPage.nextCursor).not.toBeNull();
  const items = await fetchAllPages(2);
  expect(items.map((item) => item.content)).toEqual(['最新', '并列一', '并列二', '更早']);
  expect(new Set(items.map((item) => item.id)).size).toBe(4);
}

/** 用于验证列表查询边界被拒绝。 */
async function rejectsInvalidListQueries(): Promise<void> {
  const invalidQueries = [
    { limit: 0 },
    { limit: 101 },
    { limit: 'invalid' },
    { cursor: 'not-a-cursor' },
    { unexpected: 'field' },
  ];
  for (const query of invalidQueries) {
    const response = await request(environment.getHttpServer())
      .get('/api/v1/inbox-items')
      .query(query);
    environment.expectApiError(response, 400, 'VALIDATION_FAILED', '请求参数校验失败。');
  }
}

/** 用于验证删除仅作用于本人待处理记录且不可探测。 */
async function softDeletesPendingItemsWithUniform404(): Promise<void> {
  await insertVisibilityFixtures();
  const removed = await request(environment.getHttpServer()).delete(
    `/api/v1/inbox-items/${inboxId(1)}`,
  );
  expect(removed.status).toBe(204);
  expect(removed.text).toBe('');
  expect((await readInboxRow(inboxId(1)))?.deleted_at).not.toBeNull();
  expect((await listItems()).items.map((item) => item.id)).not.toContain(inboxId(1));
  const inaccessible = [inboxId(1), inboxId(6), inboxId(8), inboxId(99)];
  for (const id of inaccessible) {
    const response = await request(environment.getHttpServer()).delete(`/api/v1/inbox-items/${id}`);
    const errorBody = environment.expectApiError(
      response,
      404,
      'NOT_FOUND',
      '请求的资源不存在或不可访问。',
    );
    expect(Object.keys(errorBody).sort()).toEqual(['code', 'message', 'requestId']);
  }
  expect((await readInboxRow(inboxId(6)))?.deleted_at).toBeNull();
  expect((await readInboxRow(inboxId(8)))?.deleted_at).toBeNull();
}

/** 用于仅在配置 PostgreSQL 时注册真实数据库 HTTP 场景。 */
function defineInboxItemIntegrationTests(): void {
  beforeAll(() => environment.prepareApplication(), 30_000);
  beforeEach(async () => {
    await environment.getDatabase().deleteFrom('inbox_items').execute();
    await environment.resetFixtures();
  });
  afterAll(() => environment.releaseApplication());
  test('creates text and url items without knowledge bases', createsItemsWithoutKnowledgeBases);
  test('rejects invalid create payloads and media types', rejectsInvalidCreatePayloads);
  test('lists only own pending items by stable order', listsOnlyOwnPendingItemsByStableOrder);
  test('paginates pending items with cursor traversal', paginatesPendingItemsWithCursorTraversal);
  test('paginates across created-at ties without duplication', paginatesAcrossCreatedAtTies);
  test('rejects invalid list queries', rejectsInvalidListQueries);
  test('soft deletes pending items with uniform 404', softDeletesPendingItemsWithUniform404);
}

describe.skipIf(databaseUrl === undefined)(
  'Inbox item HTTP integration',
  defineInboxItemIntegrationTests,
);
