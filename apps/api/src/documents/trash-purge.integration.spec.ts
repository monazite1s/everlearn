/** @fileoverview 在真实 PostgreSQL 上验证 30 天到期清理的边界、子树、幂等与失败恢复。 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { DocumentsTestEnvironment } from '../../tests/documents-integration.support';
import { LOCAL_USER_ID } from '../identity/local-identity.constants';
import { PURGE_BATCH_SIZE, TrashPurgeService } from './trash-purge.service';

const DAY_MS = 86_400_000;
const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(`trash_purge_${process.pid}`, databaseUrl ?? '');
/** 用于固定全部边界断言共享的清理时间原点。 */
const PURGE_NOW = new Date('2026-09-16T12:00:00.000Z');

/** 用于生成确定的有效 UUID。 */
function fixedId(kind: string, sequence: number): string {
  return `${kind}0000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于按相对天数构造受控删除时间。 */
function daysAgo(days: number): Date {
  return new Date(PURGE_NOW.getTime() - days * DAY_MS);
}

/** 用于承载带受控删除时间的文档夹具。 */
interface DocSeed {
  childOf?: string;
  deletedAt?: Date;
  id: string;
  knowledgeBaseId: string;
  position: number;
}

/** 用于写入带受控删除时间的知识库夹具。 */
async function insertKnowledgeBase(id: string, deletedAt: Date | null): Promise<void> {
  await environment
    .getDatabase()
    .insertInto('knowledge_bases')
    .values({
      deleted_at: deletedAt,
      id,
      kind: 'normal',
      name: `库 ${id}`,
      owner_id: LOCAL_USER_ID,
    })
    .execute();
}

/** 用于写入按种子顺序推导完整物化路径的文档夹具。 */
async function insertDocuments(seeds: readonly DocSeed[]): Promise<void> {
  const paths = new Map<string, string>();
  await environment
    .getDatabase()
    .insertInto('documents')
    .values(
      seeds.map((seed) => {
        const parentPath = seed.childOf === undefined ? undefined : paths.get(seed.childOf);
        const path =
          seed.childOf === undefined
            ? `/${seed.id}`
            : `${parentPath ?? `/${seed.childOf}`}/${seed.id}`;
        paths.set(seed.id, path);
        return {
          deleted_at: seed.deletedAt ?? null,
          deleted_parent_id: null,
          deleted_position: seed.deletedAt === undefined ? null : seed.position,
          id: seed.id,
          knowledge_base_id: seed.knowledgeBaseId,
          owner_id: LOCAL_USER_ID,
          parent_id: seed.childOf ?? null,
          path,
          position: seed.position,
          title: `文档 ${seed.id}`,
        };
      }),
    )
    .execute();
}

/** 用于写入验证随文档删除级联清理的修订行。 */
async function insertRevision(id: string, documentId: string): Promise<void> {
  await environment
    .getDatabase()
    .insertInto('document_revisions')
    .values({
      content_json: { type: 'doc' },
      created_by: LOCAL_USER_ID,
      document_id: documentId,
      id,
      owner_id: LOCAL_USER_ID,
      plain_text: '',
      revision_number: 1,
      schema_version: 1,
      source: 'manual',
      title: `修订 ${documentId}`,
    })
    .execute();
}

/** 用于写入验证外键引用处理的 Inbox 记录。 */
async function insertInboxItem(
  id: string,
  status: 'converted' | 'pending',
  documentId?: string,
): Promise<void> {
  await environment
    .getDatabase()
    .insertInto('inbox_items')
    .values({
      content: `内容 ${id}`,
      converted_document_id: documentId ?? null,
      id,
      kind: 'text',
      owner_id: LOCAL_USER_ID,
      status,
    })
    .execute();
}

/** 用于把已删文档夹具直接还原为活跃行以模拟恢复结果。 */
async function restoreDocumentFixture(id: string): Promise<void> {
  await environment
    .getDatabase()
    .updateTable('documents')
    .set({ deleted_at: null, deleted_parent_id: null, deleted_position: null })
    .where('id', '=', id)
    .execute();
}

type CountableTable = 'document_revisions' | 'documents' | 'inbox_items' | 'knowledge_bases';
/** 用于断言指定表当前行数。 */
async function countRows(table: CountableTable): Promise<number> {
  const { sql } = await import('kysely');
  const result = await sql<{ total: string | bigint }>`
    SELECT count(*) AS total FROM ${sql.raw(table)}
  `.execute(environment.getDatabase());
  const total = result.rows[0]?.total;
  return total === undefined ? 0 : Number(total);
}

/** 用于断言文档行是否仍存在。 */
async function documentExists(id: string): Promise<boolean> {
  const row = await environment
    .getDatabase()
    .selectFrom('documents')
    .select('id')
    .where('id', '=', id)
    .executeTakeFirst();
  return row !== undefined;
}

/** 用于断言知识库行是否仍存在。 */
async function knowledgeBaseExists(id: string): Promise<boolean> {
  const row = await environment
    .getDatabase()
    .selectFrom('knowledge_bases')
    .select('id')
    .where('id', '=', id)
    .executeTakeFirst();
  return row !== undefined;
}

/** 用于安装仅对指定文档抛错的删除触发器以模拟批次失败。 */
async function installPurgeFailureTrigger(documentId: string): Promise<void> {
  const { sql } = await import('kysely');
  const database = environment.getDatabase();
  await sql`CREATE FUNCTION trash_purge_fail() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'injected purge failure'; END $$`.execute(database);
  const condition = sql.raw(`OLD.id = '${documentId}'::uuid`);
  await sql`CREATE TRIGGER trash_purge_fail_trigger BEFORE DELETE ON documents
    FOR EACH ROW WHEN (${condition}) EXECUTE FUNCTION trash_purge_fail()`.execute(database);
}

/** 用于移除注入的删除失败触发器。 */
async function dropPurgeFailureTrigger(): Promise<void> {
  const { sql } = await import('kysely');
  const database = environment.getDatabase();
  await sql`DROP TRIGGER IF EXISTS trash_purge_fail_trigger ON documents`.execute(database);
  await sql`DROP FUNCTION IF EXISTS trash_purge_fail()`.execute(database);
}

/** 用于验证恰好到期即清理而晚一毫秒的删除仍保留。 */
async function purgesExactBoundaryAndKeepsNewer(): Promise<void> {
  const base = fixedId('1', 1);
  await insertKnowledgeBase(base, null);
  await insertDocuments([
    { deletedAt: daysAgo(30), id: fixedId('2', 1), knowledgeBaseId: base, position: 0 },
    {
      deletedAt: new Date(daysAgo(30).getTime() + 1),
      id: fixedId('2', 2),
      knowledgeBaseId: base,
      position: 1024,
    },
  ]);
  const stats = await purgeService.purgeExpired(PURGE_NOW);
  expect(stats).toEqual({ purgedDocuments: 1, purgedInboxItems: 0, purgedKnowledgeBases: 0 });
  expect(await documentExists(fixedId('2', 1))).toBe(false);
  expect(await documentExists(fixedId('2', 2))).toBe(true);
}

/** 用于验证到期子树一行不留且修订与 Inbox 引用同步处理。 */
async function purgesWholeSubtreeWithCascades(): Promise<void> {
  const base = fixedId('3', 1);
  const root = fixedId('3', 2);
  const child = fixedId('3', 3);
  await insertKnowledgeBase(base, null);
  await insertDocuments([
    { deletedAt: daysAgo(40), id: root, knowledgeBaseId: base, position: 0 },
    { childOf: root, deletedAt: daysAgo(40), id: child, knowledgeBaseId: base, position: 0 },
    {
      childOf: child,
      deletedAt: daysAgo(40),
      id: fixedId('3', 4),
      knowledgeBaseId: base,
      position: 0,
    },
    { id: fixedId('3', 5), knowledgeBaseId: base, position: 1024 },
  ]);
  await insertRevision(fixedId('4', 1), child);
  await insertInboxItem(fixedId('5', 1), 'converted', child);
  await insertInboxItem(fixedId('5', 2), 'converted', fixedId('3', 5));
  await insertInboxItem(fixedId('5', 3), 'pending');
  const stats = await purgeService.purgeExpired(PURGE_NOW);
  expect(stats).toEqual({ purgedDocuments: 3, purgedInboxItems: 1, purgedKnowledgeBases: 0 });
  expect(await countRows('document_revisions')).toBe(0);
  expect(await countRows('inbox_items')).toBe(2);
  expect(await documentExists(fixedId('3', 5))).toBe(true);
}

/** 用于验证隐藏到期后代随覆盖它的父条目一起清理。 */
async function keepsHiddenDescendantsUntilParentExpires(): Promise<void> {
  const base = fixedId('6', 1);
  const parent = fixedId('6', 2);
  await insertKnowledgeBase(base, null);
  await insertDocuments([
    { deletedAt: daysAgo(10), id: parent, knowledgeBaseId: base, position: 0 },
    {
      childOf: parent,
      deletedAt: daysAgo(40),
      id: fixedId('6', 3),
      knowledgeBaseId: base,
      position: 0,
    },
  ]);
  const firstRun = await purgeService.purgeExpired(PURGE_NOW);
  expect(firstRun).toEqual({ purgedDocuments: 0, purgedInboxItems: 0, purgedKnowledgeBases: 0 });
  expect(await documentExists(parent)).toBe(true);
  expect(await documentExists(fixedId('6', 3))).toBe(true);
  const secondRun = await purgeService.purgeExpired(new Date(PURGE_NOW.getTime() + 25 * DAY_MS));
  expect(secondRun).toEqual({ purgedDocuments: 2, purgedInboxItems: 0, purgedKnowledgeBases: 0 });
  expect(await documentExists(fixedId('6', 3))).toBe(false);
}

/** 用于验证仅清理到期且已无任何文档行的知识库。 */
async function purgesOnlyEmptyExpiredKnowledgeBases(): Promise<void> {
  const emptyExpired = fixedId('7', 1);
  const withActiveDoc = fixedId('7', 2);
  const withRecentDoc = fixedId('7', 3);
  await insertKnowledgeBase(emptyExpired, daysAgo(40));
  await insertKnowledgeBase(withActiveDoc, daysAgo(40));
  await insertKnowledgeBase(withRecentDoc, daysAgo(40));
  await insertKnowledgeBase(fixedId('7', 4), daysAgo(5));
  await insertKnowledgeBase(fixedId('7', 5), null);
  await insertDocuments([
    { id: fixedId('8', 1), knowledgeBaseId: withActiveDoc, position: 0 },
    { deletedAt: daysAgo(5), id: fixedId('8', 2), knowledgeBaseId: withRecentDoc, position: 0 },
  ]);
  const stats = await purgeService.purgeExpired(PURGE_NOW);
  expect(stats).toEqual({ purgedDocuments: 0, purgedInboxItems: 0, purgedKnowledgeBases: 1 });
  expect(await knowledgeBaseExists(emptyExpired)).toBe(false);
  expect(await knowledgeBaseExists(withActiveDoc)).toBe(true);
  expect(await knowledgeBaseExists(withRecentDoc)).toBe(true);
  expect(await knowledgeBaseExists(fixedId('7', 4))).toBe(true);
  expect(await documentExists(fixedId('8', 2))).toBe(true);
}

/** 用于验证同一时间重复运行稳定且不再命中已清对象。 */
async function rerunsAreIdempotent(): Promise<void> {
  const base = fixedId('9', 1);
  await insertKnowledgeBase(base, null);
  await insertKnowledgeBase(fixedId('9', 2), daysAgo(40));
  await insertDocuments([
    { deletedAt: daysAgo(40), id: fixedId('a', 1), knowledgeBaseId: base, position: 0 },
    {
      childOf: fixedId('a', 1),
      deletedAt: daysAgo(40),
      id: fixedId('a', 2),
      knowledgeBaseId: base,
      position: 0,
    },
  ]);
  const firstRun = await purgeService.purgeExpired(PURGE_NOW);
  const secondRun = await purgeService.purgeExpired(PURGE_NOW);
  expect(firstRun).toEqual({ purgedDocuments: 2, purgedInboxItems: 0, purgedKnowledgeBases: 1 });
  expect(secondRun).toEqual({ purgedDocuments: 0, purgedInboxItems: 0, purgedKnowledgeBases: 0 });
  expect(await countRows('documents')).toBe(0);
  expect(await countRows('knowledge_bases')).toBe(1);
}

/** 用于验证单次运行跨越批次上限清理全部到期根。 */
async function purgesMultipleBatchesInOneRun(): Promise<void> {
  const base = fixedId('b', 1);
  await insertKnowledgeBase(base, null);
  await insertDocuments(
    Array.from({ length: PURGE_BATCH_SIZE + 1 }, (_, index) => ({
      deletedAt: new Date(daysAgo(40).getTime() + index),
      id: fixedId('c', index + 1),
      knowledgeBaseId: base,
      position: index * 1024,
    })),
  );
  const stats = await purgeService.purgeExpired(PURGE_NOW);
  expect(stats.purgedDocuments).toBe(PURGE_BATCH_SIZE + 1);
  expect(await countRows('documents')).toBe(0);
}

/** 用于验证批次失败只回滚当批且重试从剩余对象继续。 */
async function recoversFromFailedBatch(): Promise<void> {
  const base = fixedId('d', 1);
  const poison = fixedId('d', 101);
  await insertKnowledgeBase(base, null);
  await insertKnowledgeBase(fixedId('d', 102), daysAgo(40));
  await insertDocuments([
    ...Array.from({ length: PURGE_BATCH_SIZE }, (_, index) => ({
      deletedAt: new Date(daysAgo(40).getTime() + index),
      id: fixedId('d', index + 1),
      knowledgeBaseId: base,
      position: index * 1024,
    })),
    {
      deletedAt: new Date(daysAgo(40).getTime() + 200),
      id: poison,
      knowledgeBaseId: base,
      position: 200 * 1024,
    },
    { deletedAt: daysAgo(5), id: fixedId('d', 103), knowledgeBaseId: base, position: 300 * 1024 },
  ]);
  await installPurgeFailureTrigger(poison);
  await expect(purgeService.purgeExpired(PURGE_NOW)).rejects.toThrow();
  expect(await documentExists(fixedId('d', 100))).toBe(false);
  expect(await documentExists(poison)).toBe(true);
  expect(await documentExists(fixedId('d', 103))).toBe(true);
  expect(await knowledgeBaseExists(fixedId('d', 102))).toBe(true);
  await dropPurgeFailureTrigger();
  const retry = await purgeService.purgeExpired(PURGE_NOW);
  expect(retry).toEqual({ purgedDocuments: 1, purgedInboxItems: 0, purgedKnowledgeBases: 1 });
  expect(await documentExists(poison)).toBe(false);
}

/** 用于验证已恢复的文档与知识库不会被清理。 */
async function neverPurgesRestoredObjects(): Promise<void> {
  const base = fixedId('e', 1);
  await insertKnowledgeBase(base, null);
  await insertKnowledgeBase(fixedId('e', 2), daysAgo(40));
  await insertDocuments([
    { deletedAt: daysAgo(40), id: fixedId('e', 3), knowledgeBaseId: base, position: 0 },
  ]);
  await restoreDocumentFixture(fixedId('e', 3));
  await environment
    .getDatabase()
    .updateTable('knowledge_bases')
    .set({ deleted_at: null })
    .where('id', '=', fixedId('e', 2))
    .execute();
  const stats = await purgeService.purgeExpired(PURGE_NOW);
  expect(stats).toEqual({ purgedDocuments: 0, purgedInboxItems: 0, purgedKnowledgeBases: 0 });
  expect(await documentExists(fixedId('e', 3))).toBe(true);
  expect(await knowledgeBaseExists(fixedId('e', 2))).toBe(true);
}

let purgeService: TrashPurgeService;

describe('TrashPurgeService integration', () => {
  beforeAll(async () => {
    await environment.prepareApplication();
    purgeService = environment.resolveService(TrashPurgeService);
  });

  afterAll(() => environment.releaseApplication());

  beforeEach(async () => {
    await dropPurgeFailureTrigger();
    await environment.resetFixtures();
  });

  test('purges exact 30-day boundary and keeps newer', purgesExactBoundaryAndKeepsNewer);
  test(
    'purges whole subtree with cascading revisions and inbox references',
    purgesWholeSubtreeWithCascades,
  );
  test(
    'keeps hidden expired descendants until covering parent expires',
    keepsHiddenDescendantsUntilParentExpires,
  );
  test('purges only empty expired knowledge bases', purgesOnlyEmptyExpiredKnowledgeBases);
  test('reruns are idempotent', rerunsAreIdempotent);
  test('purges multiple batches in one run', purgesMultipleBatchesInOneRun);
  test('recovers from failed batch', recoversFromFailedBatch);
  test('never purges restored objects', neverPurgesRestoredObjects);
});
