/** @fileoverview 在真实 PostgreSQL 中验证文档写路径原子产生可重放 Search 事件。 */

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import type { DocumentDetail } from '@everlearn/contracts' with { 'resolution-mode': 'import' };

import { DocumentsTestEnvironment } from '../../tests/documents-integration.support';
import { LOCAL_USER_ID } from '../identity/local-identity.constants';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(`search_outbox_${process.pid}`, databaseUrl ?? '');
const knowledgeBaseId = '28000000-0000-4000-8000-000000000001';
const inboxId = '28000000-0000-4000-8000-000000000002';

interface SearchEventRow {
  readonly aggregateVersion: number;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
}

/** 用于构造带稳定块标识的合法正文。 */
function contentOf(sequence: number, text: string) {
  return {
    content: [
      {
        attrs: {
          blockId: `29000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`,
        },
        content: [{ text, type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  };
}

/** 用于通过公开 HTTP 创建文档并返回详情。 */
async function createDocument(title: string, parentId?: string): Promise<DocumentDetail> {
  const response = await request(environment.getHttpServer())
    .post(`/api/v1/knowledge-bases/${knowledgeBaseId}/documents`)
    .send({ ...(parentId === undefined ? {} : { parentId }), title });
  expect(response.status).toBe(201);
  return environment.parseBody<DocumentDetail>(response);
}

/** 用于读取单文档按版本和类型稳定排序的全部 Search 事件。 */
async function readEvents(documentId: string): Promise<readonly SearchEventRow[]> {
  const { sql } = await import('kysely');
  const result = await sql<SearchEventRow>`
    SELECT aggregate_version AS "aggregateVersion", event_type AS "eventType", payload
    FROM outbox_events
    WHERE aggregate_id = ${documentId}::uuid
    ORDER BY aggregate_version, event_type
  `.execute(environment.getDatabase());
  return result.rows;
}

/** 用于断言保存事件包含精确文档版本、Schema 与知识库范围。 */
function expectSavedEvent(row: SearchEventRow | undefined, document: DocumentDetail): void {
  expect(row).toEqual({
    aggregateVersion: document.version,
    eventType: 'document.saved',
    payload: {
      contentSchemaVersion: 1,
      documentId: document.id,
      documentVersion: document.version,
      eventSchemaVersion: 1,
      knowledgeBaseId,
    },
  });
}

/** 用于验证保存成功原子追加事件且冲突重试不制造重复。 */
async function savesContentWithOneVersionedEvent(): Promise<void> {
  const created = await createDocument('保存事件');
  expect(await readEvents(created.id)).toEqual([]);
  const body = { contentJson: contentOf(1, 'transactional outbox'), schemaVersion: 1, version: 1 };
  const saved = await request(environment.getHttpServer())
    .patch(`/api/v1/documents/${created.id}/content`)
    .send(body);
  expect(saved.status).toBe(200);
  const detail = environment.parseBody<DocumentDetail>(saved);
  expectSavedEvent((await readEvents(created.id))[0], detail);
  const stale = await request(environment.getHttpServer())
    .patch(`/api/v1/documents/${created.id}/content`)
    .send(body);
  expect(stale.status).toBe(409);
  expect(await readEvents(created.id)).toHaveLength(1);
}

/** 用于验证 Outbox 插入失败时正文与版本同事务回滚。 */
async function rollsBackContentWhenOutboxFails(): Promise<void> {
  const created = await createDocument('回滚事件');
  const { sql } = await import('kysely');
  await sql`CREATE FUNCTION reject_search_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'injected outbox failure'; END $$`.execute(environment.getDatabase());
  await sql`CREATE TRIGGER reject_search_outbox_trigger BEFORE INSERT ON outbox_events
    FOR EACH ROW EXECUTE FUNCTION reject_search_outbox()`.execute(environment.getDatabase());
  const response = await request(environment.getHttpServer())
    .patch(`/api/v1/documents/${created.id}/content`)
    .send({ contentJson: contentOf(2, '不会提交'), schemaVersion: 1, version: 1 });
  expect(response.status).toBe(500);
  const document = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['plain_text', 'version'])
    .where('id', '=', created.id)
    .executeTakeFirstOrThrow();
  expect(document).toMatchObject({ plain_text: '', version: 1 });
  expect(await readEvents(created.id)).toEqual([]);
  await sql`DROP TRIGGER reject_search_outbox_trigger ON outbox_events`.execute(
    environment.getDatabase(),
  );
  await sql`DROP FUNCTION reject_search_outbox()`.execute(environment.getDatabase());
}

/** 用于验证 Inbox 非空初始正文只在首次幂等转换时产生保存事件。 */
async function convertsInboxWithInitialSavedEvent(): Promise<void> {
  await environment
    .getDatabase()
    .insertInto('inbox_items')
    .values({
      content: '幂等设计',
      id: inboxId,
      kind: 'text',
      owner_id: LOCAL_USER_ID,
      status: 'pending',
    })
    .execute();
  const pending = request(environment.getHttpServer())
    .post(`/api/v1/inbox-items/${inboxId}/convert`)
    .set('Idempotency-Key', 'search-outbox-convert')
    .send({ knowledgeBaseId, title: '转换文档' });
  const first = await pending;
  expect(first.status).toBe(201);
  const detail = environment.parseBody<DocumentDetail>(first);
  expectSavedEvent((await readEvents(detail.id))[0], detail);
  const replay = await request(environment.getHttpServer())
    .post(`/api/v1/inbox-items/${inboxId}/convert`)
    .set('Idempotency-Key', 'search-outbox-convert')
    .send({ knowledgeBaseId, title: '转换文档' });
  expect(replay.status).toBe(201);
  expect(environment.parseBody<DocumentDetail>(replay).id).toBe(detail.id);
  expect(await readEvents(detail.id)).toHaveLength(1);
}

/** 用于断言子树每个实际改变节点都有单调的删除与恢复事件。 */
async function emitsLifecycleEventsForEverySubtreeNode(): Promise<void> {
  const root = await createDocument('根');
  const child = await createDocument('子', root.id);
  const removed = await request(environment.getHttpServer())
    .delete(`/api/v1/documents/${root.id}`)
    .send({ version: root.version });
  expect(removed.status).toBe(204);
  const restored = await request(environment.getHttpServer())
    .post(`/api/v1/documents/${root.id}/restore`)
    .set('Idempotency-Key', 'search-outbox-restore')
    .send({ version: root.version + 1 });
  expect(restored.status).toBe(200);
  for (const document of [root, child]) {
    expect(
      (await readEvents(document.id)).map(({ aggregateVersion, eventType }) => ({
        aggregateVersion,
        eventType,
      })),
    ).toEqual([
      { aggregateVersion: 2, eventType: 'document.deleted' },
      { aggregateVersion: 3, eventType: 'document.restored' },
    ]);
  }
}

/** 用于仅在真实 PostgreSQL 可用时注册 Outbox 生产路径场景。 */
function defineDocumentSearchOutboxTests(): void {
  beforeAll(() => environment.prepareApplication(), 30_000);
  beforeEach(async () => {
    await environment.resetFixtures();
    await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: 'Search Outbox' }]);
  });
  afterAll(() => environment.releaseApplication());
  test('saves content with one versioned event', savesContentWithOneVersionedEvent);
  test('rolls back content when Outbox insertion fails', rollsBackContentWhenOutboxFails);
  test('converts Inbox with an initial saved event', convertsInboxWithInitialSavedEvent);
  test('emits lifecycle events for every subtree node', emitsLifecycleEventsForEverySubtreeNode);
}

describe.skipIf(databaseUrl === undefined)(
  'document Search Outbox producers',
  defineDocumentSearchOutboxTests,
);
