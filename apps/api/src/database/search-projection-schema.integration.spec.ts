/** @fileoverview 在隔离 PostgreSQL Schema 中验证搜索投影迁移及其数据库不变量。 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createDatabaseClient } from './database.service';
import type { DatabaseSchema } from './database.types';
import { runMigrations } from './migration-runner';
import { LOCAL_USER_ID } from './migrations/20260812010100_local_user_seed';

const databaseUrl = process.env.DATABASE_URL;
const schemaName = `search_projection_test_${process.pid}`;
const failureSchemaName = `search_projection_failure_test_${process.pid}`;
const migrationName = '20260824000000_search_projection';
const knowledgeBaseId = '24000000-0000-4000-8000-000000000001';
const documentId = '24000000-0000-4000-8000-000000000002';
const blockId = '24000000-0000-4000-8000-000000000003';
let database: Kysely<DatabaseSchema>;

/** 用于把连接限定到本测试创建的隔离 Schema。 */
function scopedDatabaseUrl(connectionString: string, schema: string): string {
  const url = new URL(connectionString);
  url.searchParams.set('options', `-csearch_path=${schema}`);
  return url.toString();
}

/** 用于创建隔离 Schema 并应用生产迁移。 */
async function prepareDatabase(): Promise<void> {
  const admin = await createDatabaseClient(databaseUrl!);
  await admin.schema.createSchema(schemaName).execute();
  await admin.destroy();
  database = await createDatabaseClient(scopedDatabaseUrl(databaseUrl!, schemaName));
  await runMigrations(database, migrationOptions('up', schemaName));
}

/** 用于删除测试 Schema 并释放数据库连接。 */
async function cleanDatabase(): Promise<void> {
  await database.destroy();
  const admin = await createDatabaseClient(databaseUrl!);
  await admin.schema.dropSchema(schemaName).ifExists().cascade().execute();
  await admin.schema.dropSchema(failureSchemaName).ifExists().cascade().execute();
  await admin.destroy();
}

/** 用于创建确定的隔离迁移元数据配置。 */
function migrationOptions(direction: 'down' | 'up', schema: string) {
  return {
    direction,
    migrationLockTableName: 'migration_lock',
    migrationTableName: 'migration_history',
    migrationTableSchema: schema,
  } as const;
}

/** 用于写入搜索投影约束测试所需的最小知识文档。 */
async function insertDocumentFixture(): Promise<void> {
  await database
    .insertInto('knowledge_bases')
    .values({ id: knowledgeBaseId, kind: 'normal', name: '搜索测试库', owner_id: LOCAL_USER_ID })
    .execute();
  await database
    .insertInto('documents')
    .values({
      id: documentId,
      knowledge_base_id: knowledgeBaseId,
      owner_id: LOCAL_USER_ID,
      parent_id: null,
      path: `/${documentId}`,
      position: 0,
      title: '搜索测试文档',
    })
    .execute();
}

/** 用于返回当前 Schema 内指定业务表是否存在。 */
async function tableExists(target: Kysely<DatabaseSchema>, schema: string, name: string) {
  const tables = await target.introspection.getTables();
  return tables.some((table) => table.schema === schema && table.name === name);
}

/** 用于验证搜索迁移可以独立回退并再次应用。 */
async function migratesUpDownAndUp(): Promise<void> {
  expect(await tableExists(database, schemaName, 'outbox_events')).toBe(true);
  expect(await tableExists(database, schemaName, 'search_document_projections')).toBe(true);
  expect(await tableExists(database, schemaName, 'search_blocks')).toBe(true);

  const down = await runMigrations(database, migrationOptions('down', schemaName));
  expect(down.executedMigrations).toEqual([migrationName]);
  expect(await tableExists(database, schemaName, 'outbox_events')).toBe(false);
  expect(await tableExists(database, schemaName, 'search_document_projections')).toBe(false);
  expect(await tableExists(database, schemaName, 'search_blocks')).toBe(false);

  const up = await runMigrations(database, migrationOptions('up', schemaName));
  expect(up.executedMigrations).toEqual([migrationName]);
}

/** 用于插入一条有效 Outbox 事件。 */
async function insertOutboxEvent(id: string): Promise<void> {
  const { sql } = await import('kysely');
  await sql`INSERT INTO outbox_events
      (id, owner_id, event_type, aggregate_id, aggregate_version, schema_version, payload)
    VALUES (${id}::uuid, ${LOCAL_USER_ID}::uuid, 'document.saved', ${documentId}::uuid, 1, 1,
      ${JSON.stringify({ documentId, documentVersion: 1, eventSchemaVersion: 1 })}::jsonb)`.execute(
    database,
  );
}

/** 用于验证 Outbox 的受控状态、版本和业务幂等约束。 */
async function enforcesOutboxConstraints(): Promise<void> {
  const eventId = '24000000-0000-4000-8000-000000000010';
  await insertOutboxEvent(eventId);
  await expect(insertOutboxEvent('24000000-0000-4000-8000-000000000011')).rejects.toThrow();
  const { sql } = await import('kysely');
  await expect(
    sql`UPDATE outbox_events SET attempt_count = -1 WHERE id = ${eventId}::uuid`.execute(database),
  ).rejects.toThrow();
  await expect(
    sql`UPDATE outbox_events SET processed_at = now(), failed_at = now() WHERE id = ${eventId}::uuid`.execute(
      database,
    ),
  ).rejects.toThrow();
  await expect(
    sql`INSERT INTO outbox_events
      (id, owner_id, event_type, aggregate_id, aggregate_version, schema_version, payload)
    VALUES (${`24000000-0000-4000-8000-000000000012`}::uuid, ${LOCAL_USER_ID}::uuid,
      'unknown.event', ${documentId}::uuid, 1, 1, '{}'::jsonb)`.execute(database),
  ).rejects.toThrow();
}

/** 用于插入一条当前文档搜索投影及其块。 */
async function insertSearchProjection(): Promise<void> {
  const { sql } = await import('kysely');
  await sql`INSERT INTO search_document_projections
      (document_id, owner_id, indexed_document_version, indexed_content_hash)
    VALUES (${documentId}::uuid, ${LOCAL_USER_ID}::uuid, 1, ${'a'.repeat(64)})`.execute(database);
  await insertSearchBlock('24000000-0000-4000-8000-000000000020');
}

/** 用于写入具有稳定文档内 blockId 的搜索块。 */
async function insertSearchBlock(id: string): Promise<void> {
  const { sql } = await import('kysely');
  await sql`INSERT INTO search_blocks
      (id, owner_id, document_id, document_version, block_id, block_order, text, heading_path, content_hash)
    VALUES (${id}::uuid, ${LOCAL_USER_ID}::uuid,
      ${documentId}::uuid, 1, ${blockId}::uuid, 0, '知识管理系统', ARRAY['知识库'], ${'b'.repeat(64)})`.execute(
    database,
  );
}

/** 用于验证块唯一性、生成向量、中文 trigram 与级联删除。 */
async function enforcesSearchProjectionConstraints(): Promise<void> {
  await insertDocumentFixture();
  await insertSearchProjection();
  const { sql } = await import('kysely');
  const row = await sql<{ partialMatch: boolean; vector: string }>`
    SELECT search_vector::text AS vector, text ILIKE ${'%知识管理%'} AS "partialMatch"
    FROM search_blocks WHERE document_id = ${documentId}::uuid AND owner_id = ${LOCAL_USER_ID}::uuid
  `.execute(database);
  expect(row.rows[0]).toMatchObject({ partialMatch: true, vector: "'知识管理系统':1" });
  await sql`UPDATE search_blocks SET text = '分布式系统中的幂等设计'
    WHERE document_id = ${documentId}::uuid`.execute(database);
  const chinese = await sql<{ matches: boolean }>`SELECT text ILIKE ${'%幂等%'} AS matches
    FROM search_blocks WHERE document_id = ${documentId}::uuid`.execute(database);
  expect(chinese.rows[0]?.matches).toBe(true);
  await sql`UPDATE search_blocks SET text = 'transactional outbox'
    WHERE document_id = ${documentId}::uuid`.execute(database);
  const english = await sql<{ matches: boolean }>`SELECT search_vector @@
      plainto_tsquery('pg_catalog.simple'::regconfig, ${'outbox'}) AS matches
    FROM search_blocks WHERE document_id = ${documentId}::uuid`.execute(database);
  expect(english.rows[0]?.matches).toBe(true);
  const indexes = await sql<{ indexdef: string }>`
    SELECT indexdef FROM pg_indexes WHERE schemaname = ${schemaName} AND tablename = 'search_blocks'
  `.execute(database);
  expect(indexes.rows.some(({ indexdef }) => indexdef.includes('gin_trgm_ops'))).toBe(true);
  await expect(insertSearchBlock('24000000-0000-4000-8000-000000000021')).rejects.toThrow();
  await database.deleteFrom('documents').where('id', '=', documentId).execute();
  const counts = await sql<{ blocks: string; projections: string }>`
    SELECT (SELECT count(*) FROM search_blocks)::text AS blocks,
      (SELECT count(*) FROM search_document_projections)::text AS projections
  `.execute(database);
  expect(counts.rows[0]).toEqual({ blocks: '0', projections: '0' });
}

/** 用于验证迁移中途失败时不会留下先创建的 Outbox 表。 */
async function rollsBackFailedMigrationAtomically(): Promise<void> {
  const admin = await createDatabaseClient(databaseUrl!);
  await admin.schema.createSchema(failureSchemaName).execute();
  await admin.destroy();
  const target = await createDatabaseClient(scopedDatabaseUrl(databaseUrl!, failureSchemaName));
  await target.schema
    .createTable('search_document_projections')
    .addColumn('id', 'integer')
    .execute();
  await expect(runMigrations(target, migrationOptions('up', failureSchemaName))).rejects.toThrow();
  expect(await tableExists(target, failureSchemaName, 'outbox_events')).toBe(false);
  expect(await tableExists(target, failureSchemaName, 'search_blocks')).toBe(false);
  await target.destroy();
}

/** 用于仅在配置 PostgreSQL 时注册真实迁移场景。 */
function defineSearchProjectionMigrationTests(): void {
  beforeAll(prepareDatabase);
  afterAll(cleanDatabase);
  test('migrates search projection up, down, and up again', migratesUpDownAndUp);
  test('enforces Outbox retry and idempotency constraints', enforcesOutboxConstraints);
  test(
    'enforces indexed blocks and cascades document deletion',
    enforcesSearchProjectionConstraints,
  );
  test(
    'rolls back every statement when migration fails midway',
    rollsBackFailedMigrationAtomically,
  );
}

describe.skipIf(databaseUrl === undefined)(
  'search projection schema migration',
  defineSearchProjectionMigrationTests,
);
