/** @fileoverview 在隔离 PostgreSQL Schema 验证 AI-04 向量列、扩展与 HNSW 索引迁移。 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createDatabaseClient } from './database.service';
import type { DatabaseSchema } from './database.types';
import { runMigrations } from './migration-runner';

const databaseUrl = process.env.DATABASE_URL;
const schemaName = `search_embeddings_${process.pid}`;
const migrationName = '20260904000000_search_embeddings';
let database: Kysely<DatabaseSchema> | undefined;

/** 用于返回已初始化测试客户端并在夹具失败时快速终止。 */
function getDatabase(): Kysely<DatabaseSchema> {
  if (database === undefined) throw new Error('Search embeddings database is not initialized');
  return database;
}

/** 用于把测试连接的搜索路径限制在隔离 Schema 并保留 public 以解析 vector 类型。 */
function scopedDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set('options', `-csearch_path=${schemaName},public`);
  return url.toString();
}

/** 用于创建隔离 Schema 并应用全部生产迁移。 */
async function prepareDatabase(): Promise<void> {
  const admin = await createDatabaseClient(databaseUrl!);
  await admin.schema.dropSchema(schemaName).ifExists().cascade().execute();
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

/** 用于读取当前 Schema 的向量扩展、嵌入列与索引状态。 */
async function readEmbeddingState(): Promise<{
  readonly columns: readonly string[];
  readonly extension: boolean;
  readonly indexDef: string | undefined;
}> {
  const { sql } = await import('kysely');
  const extension = await sql<{ extname: string }>`
    SELECT extname FROM pg_extension WHERE extname = 'vector'
  `.execute(getDatabase());
  const columns = await sql<{ column_name: string }>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = ${schemaName} AND table_name = 'search_blocks'
      AND column_name LIKE 'embedding%' ORDER BY column_name
  `.execute(getDatabase());
  const index = await sql<{ indexdef: string }>`
    SELECT indexdef FROM pg_indexes
    WHERE schemaname = ${schemaName} AND indexname = 'search_blocks_embedding_hnsw_idx'
  `.execute(getDatabase());
  return {
    columns: columns.rows.map((row) => row.column_name),
    extension: extension.rows.length === 1,
    indexDef: index.rows[0]?.indexdef,
  };
}

/** 用于验证扩展、三列与 HNSW 索引的降级可逆与重新应用。 */
describe.skipIf(databaseUrl === undefined)('search embeddings migration', () => {
  beforeAll(prepareDatabase);
  afterAll(cleanDatabase);

  test('applies extension, columns, and hnsw index on up', async () => {
    const state = await readEmbeddingState();
    expect(state.extension).toBe(true);
    expect(state.columns).toEqual(['embedding', 'embedding_content_hash', 'embedding_model']);
    expect(state.indexDef).toContain('hnsw');
    expect(state.indexDef).toContain('vector_cosine_ops');
  });

  test('reverts columns and index but keeps the extension on down, then reapplies', async () => {
    const down = await runMigrations(getDatabase(), migrationOptions('down'));
    expect(down.executedMigrations).toEqual([migrationName]);
    let state = await readEmbeddingState();
    expect(state.extension).toBe(true);
    expect(state.columns).toEqual([]);
    expect(state.indexDef).toBeUndefined();

    const up = await runMigrations(getDatabase(), migrationOptions('up'));
    expect(up.executedMigrations).toEqual([migrationName]);
    state = await readEmbeddingState();
    expect(state.columns).toEqual(['embedding', 'embedding_content_hash', 'embedding_model']);
    expect(state.indexDef).toContain('hnsw');
  });
});
