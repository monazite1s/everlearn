/** @fileoverview 在隔离 PostgreSQL Schema 验证 SEARCH-02 三个标题与范围索引迁移。 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createDatabaseClient } from './database.service';
import type { DatabaseSchema } from './database.types';
import { runMigrations } from './migration-runner';
import { LOCAL_USER_ID } from './migrations/20260812010100_local_user_seed';

const databaseUrl = process.env.DATABASE_URL;
const schemaName = `search_query_indexes_${process.pid}`;
const migrationName = '20260825000000_search_query_indexes';
const knowledgeBaseId = '56000000-0000-4000-8000-000000000001';
const indexNames = [
  'documents_active_title_trgm_idx',
  'documents_active_title_vector_idx',
  'documents_owner_base_active_updated_idx',
] as const;
let database: Kysely<DatabaseSchema> | undefined;

/** 用于返回已初始化测试客户端并在夹具失败时快速终止。 */
function getDatabase(): Kysely<DatabaseSchema> {
  if (database === undefined) throw new Error('Search query index database is not initialized');
  return database;
}

/** 用于把测试连接的默认搜索路径限制在隔离 Schema。 */
function scopedDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set('options', `-csearch_path=${schemaName}`);
  return url.toString();
}

/** 用于创建隔离 Schema 并应用全部生产迁移。 */
async function prepareDatabase(): Promise<void> {
  const admin = await createDatabaseClient(databaseUrl!);
  await admin.schema.createSchema(schemaName).execute();
  await admin.destroy();
  database = await createDatabaseClient(scopedDatabaseUrl(databaseUrl!));
  await runMigrations(database, migrationOptions('up'));
}

/** 用于清理测试连接和自有隔离 Schema。 */
async function cleanDatabase(): Promise<void> {
  await database?.destroy();
  const admin = await createDatabaseClient(databaseUrl!);
  await admin.schema.dropSchema(schemaName).ifExists().cascade().execute();
  await admin.destroy();
}

/** 用于返回隔离迁移表配置且不影响真实业务迁移历史。 */
function migrationOptions(direction: 'down' | 'up') {
  return {
    direction,
    migrationLockTableName: 'migration_lock',
    migrationTableName: 'migration_history',
    migrationTableSchema: schemaName,
  } as const;
}

/** 用于读取 documents 上的完整索引定义。 */
async function readDocumentIndexes(): Promise<Map<string, string>> {
  const { sql } = await import('kysely');
  const result = await sql<{ indexdef: string; indexname: string }>`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = ${schemaName} AND tablename = 'documents'
  `.execute(getDatabase());
  return new Map(result.rows.map(({ indexdef, indexname }) => [indexname, indexdef]));
}

/** 用于验证三个索引定义、隔离回退和重新应用均精确可执行。 */
async function migratesSearchQueryIndexesUpDownAndUp(): Promise<void> {
  let indexes = await readDocumentIndexes();
  expect(indexes.get(indexNames[0])).toContain('gin_trgm_ops');
  expect(indexes.get(indexNames[1])).toContain("to_tsvector('simple'::regconfig, title)");
  expect(indexes.get(indexNames[2])).toContain(
    '(owner_id, knowledge_base_id, updated_at DESC, id)',
  );
  for (const name of indexNames) expect(indexes.get(name)).toContain('WHERE (deleted_at IS NULL)');

  const reverted: string[] = [];
  while (!reverted.includes(migrationName) && reverted.length < 20) {
    const step = await runMigrations(getDatabase(), migrationOptions('down'));
    reverted.push(...step.executedMigrations);
  }
  expect(reverted.at(-1)).toBe(migrationName);
  indexes = await readDocumentIndexes();
  for (const name of indexNames) expect(indexes.has(name)).toBe(false);

  const up = await runMigrations(getDatabase(), migrationOptions('up'));
  expect(up.executedMigrations).toEqual(reverted.toReversed());
  indexes = await readDocumentIndexes();
  for (const name of indexNames) expect(indexes.has(name)).toBe(true);
}

/** 用于写入足量且选择性明确的真实标题查询夹具。 */
async function insertExplainFixtures(): Promise<void> {
  const { sql } = await import('kysely');
  await sql`INSERT INTO knowledge_bases (id, owner_id, name, kind)
    VALUES (${knowledgeBaseId}::uuid, ${LOCAL_USER_ID}::uuid, '查询计划库', 'normal')`.execute(
    getDatabase(),
  );
  await sql`INSERT INTO documents
      (id, owner_id, knowledge_base_id, parent_id, path, position, title, updated_at)
    SELECT id::uuid, ${LOCAL_USER_ID}::uuid, ${knowledgeBaseId}::uuid, NULL,
      '/' || id, sequence, CASE sequence
        WHEN 1 THEN 'reliable transactional outbox'
        WHEN 2 THEN '分布式系统中的幂等设计'
        ELSE 'ordinary reference ' || sequence::text END,
      TIMESTAMPTZ '2026-01-01T00:00:00Z' + sequence * interval '1 second'
    FROM (
      SELECT sequence,
        ('57000000-0000-4000-8000-' || lpad(sequence::text, 12, '0')) AS id
      FROM generate_series(1, 50000) AS sequence
    ) fixtures`.execute(getDatabase());
  await sql`ANALYZE documents`.execute(getDatabase());
}

/** 用于把 PostgreSQL 文本计划按原顺序折叠为可断言字符串。 */
function planText(rows: readonly { readonly 'QUERY PLAN': string }[]): string {
  return rows.map((row) => row['QUERY PLAN']).join('\n');
}

/** 用于验证三个查询形态与一字符中文风险均有真实计划证据。 */
async function explainsRepresentativeQueries(): Promise<void> {
  await insertExplainFixtures();
  const { sql } = await import('kysely');
  const titleFts = await sql<{ 'QUERY PLAN': string }>`EXPLAIN (ANALYZE, FORMAT TEXT)
    SELECT id FROM documents WHERE owner_id = ${LOCAL_USER_ID}::uuid AND deleted_at IS NULL
      AND to_tsvector('pg_catalog.simple'::regconfig, title)
        @@ plainto_tsquery('pg_catalog.simple'::regconfig, ${'outbox'})`.execute(getDatabase());
  const titleTrigram = await sql<{ 'QUERY PLAN': string }>`EXPLAIN (ANALYZE, FORMAT TEXT)
    SELECT id FROM documents WHERE owner_id = ${LOCAL_USER_ID}::uuid AND deleted_at IS NULL
      AND title ILIKE ${'%幂等设计%'}`.execute(getDatabase());
  const scopedUpdated = await sql<{ 'QUERY PLAN': string }>`EXPLAIN (ANALYZE, FORMAT TEXT)
    SELECT id FROM documents WHERE owner_id = ${LOCAL_USER_ID}::uuid
      AND knowledge_base_id = ${knowledgeBaseId}::uuid AND deleted_at IS NULL
      AND updated_at > ${'2026-01-01T00:00:00Z'}::timestamptz
    ORDER BY updated_at DESC, id LIMIT 20`.execute(getDatabase());
  const singleChinese = await sql<{ 'QUERY PLAN': string }>`EXPLAIN (ANALYZE, FORMAT TEXT)
    SELECT id FROM documents WHERE owner_id = ${LOCAL_USER_ID}::uuid AND deleted_at IS NULL
      AND title ILIKE ${'%幂%'}`.execute(getDatabase());
  expect(planText(titleFts.rows)).toContain('documents_active_title_vector_idx');
  expect(planText(titleTrigram.rows)).toContain('documents_active_title_trgm_idx');
  expect(planText(scopedUpdated.rows)).toContain('documents_owner_base_active_updated_idx');
  const timing = /Execution Time: ([\d.]+) ms/u.exec(planText(singleChinese.rows));
  expect(Number(timing?.[1])).toBeLessThan(300);
}

/** 用于只在真实 PostgreSQL 已配置时注册迁移测试。 */
function defineSearchQueryIndexTests(): void {
  beforeAll(prepareDatabase);
  afterAll(cleanDatabase);
  test(
    'migrates three search query indexes up, down, and up',
    migratesSearchQueryIndexesUpDownAndUp,
  );
  test('explains representative title and scoped queries', explainsRepresentativeQueries);
}

describe.skipIf(databaseUrl === undefined)(
  'search query indexes migration',
  defineSearchQueryIndexTests,
);
