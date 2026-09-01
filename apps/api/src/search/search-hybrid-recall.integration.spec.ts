/** @fileoverview 在真实 PostgreSQL 验证向量回填幂等、距离排序、所有权隔离与混合召回。 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { FakeEmbeddingProvider } from '../ai/embedding';
import { createDatabaseClient } from '../database/database.service';
import type { DatabaseSchema } from '../database/database.types';
import { runMigrations } from '../database/migration-runner';
import { LOCAL_USER_ID } from '../database/migrations/20260812010100_local_user_seed';
import { SearchEmbeddingService } from './search-embedding.service';
import { readHybridRecallRows } from './search-query.store';

const databaseUrl = process.env.DATABASE_URL;
const schemaName = `search_hybrid_recall_${process.pid}`;
const knowledgeBaseId = '61000000-0000-4000-8000-000000000001';
const otherOwnerId = '61000000-0000-4000-8000-0000000000f0';
const otherKnowledgeBaseId = '61000000-0000-4000-8000-000000000002';
const docVectorText = '向量检索提供语义语义召回能力';
const docFtsText = '全文检索依赖 tsvector 与倒排索引';
const otherOwnerText = '向量检索提供语义语义召回能力';
let database: Kysely<DatabaseSchema> | undefined;

/** 用于返回已初始化测试客户端并在夹具失败时快速终止。 */
function getDatabase(): Kysely<DatabaseSchema> {
  if (database === undefined) throw new Error('Search hybrid recall database is not initialized');
  return database;
}

/** 用于把测试连接的搜索路径限制在隔离 Schema 并保留 public 以解析 vector 类型。 */
function scopedDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set('options', `-csearch_path=${schemaName},public`);
  return url.toString();
}

/** 用于写入两个所有者各自的知识库、当前版本文档与投影块夹具。 */
async function insertFixtures(): Promise<void> {
  const { sql } = await import('kysely');
  await sql`INSERT INTO knowledge_bases (id, owner_id, name, kind)
    VALUES (${knowledgeBaseId}::uuid, ${LOCAL_USER_ID}::uuid, '混合召回库', 'normal'),
      (${otherKnowledgeBaseId}::uuid, ${otherOwnerId}::uuid, '隔离对照库', 'normal')`.execute(
    getDatabase(),
  );
  await sql`INSERT INTO documents (id, owner_id, knowledge_base_id, path, position, title)
    VALUES
      ('62000000-0000-4000-8000-000000000001'::uuid, ${LOCAL_USER_ID}::uuid,
        ${knowledgeBaseId}::uuid,
        '/61000000-0000-4000-8000-0000000000a1/62000000-0000-4000-8000-000000000001', 1, '向量文档'),
      ('62000000-0000-4000-8000-000000000002'::uuid, ${LOCAL_USER_ID}::uuid,
        ${knowledgeBaseId}::uuid,
        '/61000000-0000-4000-8000-0000000000a2/62000000-0000-4000-8000-000000000002', 2, '全文文档'),
      ('62000000-0000-4000-8000-0000000000f1'::uuid, ${otherOwnerId}::uuid,
        ${otherKnowledgeBaseId}::uuid,
        '/61000000-0000-4000-8000-0000000000b1/62000000-0000-4000-8000-0000000000f1', 1, '他人文档')`.execute(
    getDatabase(),
  );
  await sql`INSERT INTO search_document_projections
      (document_id, owner_id, indexed_document_version, indexed_content_hash)
    SELECT d.id, d.owner_id, d.version, ${'a'.repeat(64)} FROM documents d`.execute(getDatabase());
  await sql`INSERT INTO search_blocks (id, owner_id, document_id, document_version, block_id,
      block_order, text, content_hash)
    SELECT gen_random_uuid(), d.owner_id, d.id, d.version, d.id, 0,
      CASE d.title WHEN '向量文档' THEN ${docVectorText}
        WHEN '全文文档' THEN ${docFtsText} ELSE ${otherOwnerText} END,
      md5(d.id::text || d.title) || md5(d.title || d.id::text)
    FROM documents d`.execute(getDatabase());
}

/** 用于创建隔离 Schema 并应用全部生产迁移后写入夹具。 */
async function prepareDatabase(): Promise<void> {
  const admin = await createDatabaseClient(databaseUrl!);
  await admin.schema.dropSchema(schemaName).ifExists().cascade().execute();
  await admin.schema.createSchema(schemaName).execute();
  await admin.destroy();
  database = await createDatabaseClient(scopedDatabaseUrl(databaseUrl!));
  await runMigrations(database, {
    direction: 'up',
    migrationLockTableName: 'migration_lock',
    migrationTableName: 'migration_history',
    migrationTableSchema: schemaName,
  });
  await sqlUserSeed();
  await insertFixtures();
}

/** 用于补种第二个所有者用户行以满足外键。 */
async function sqlUserSeed(): Promise<void> {
  const { sql } = await import('kysely');
  await sql`INSERT INTO users (id, display_name, timezone)
    VALUES (${otherOwnerId}::uuid, '其他所有者', 'UTC')
    ON CONFLICT DO NOTHING`.execute(getDatabase());
}

/** 用于清理测试连接和自有隔离 Schema。 */
async function cleanDatabase(): Promise<void> {
  await database?.destroy();
  const admin = await createDatabaseClient(databaseUrl!);
  await admin.schema.dropSchema(schemaName).ifExists().cascade().execute();
  await admin.destroy();
}

/** 用于构造最小 ConfigService 桩以驱动回填服务（配置 Provider 时注入伪实现）。 */
function createEmbeddingService(
  model: string | undefined,
  provider?: FakeEmbeddingProvider,
): SearchEmbeddingService {
  const config = {
    /** 用于按需返回模型名并保持其余配置为未配置。 */
    get: (key: string) => (key === 'EMBEDDING_MODEL' ? model : undefined),
    /** 用于在缺失模型配置时以异常快速失败。 */
    getOrThrow: () => {
      if (model === undefined) throw new Error('EMBEDDING_MODEL missing');
      return model;
    },
  };
  return new SearchEmbeddingService({ client: getDatabase() } as never, config as never, provider);
}

/** 用于以伪 Provider 回填全部夹具块向量（供纯召回测试复用）。 */
async function backfillAllWithFake(): Promise<void> {
  const stats = await createEmbeddingService('fake-model', new FakeEmbeddingProvider()).backfill();
  expect(stats.skipped).toBe(false);
}

/** 用于验证未配置时降级、首次回填写入三列与重复回填保持幂等。 */
async function verifyBackfillIdempotency(): Promise<void> {
  const unconfigured = await createEmbeddingService(undefined).backfill();
  expect(unconfigured).toEqual({ skipped: true, updatedBlocks: 0 });

  const first = await createEmbeddingService('fake-model', new FakeEmbeddingProvider()).backfill();
  expect(first.updatedBlocks).toBe(3);
  const { sql } = await import('kysely');
  const rows = await sql<{ count: string; with_model: string }>`
    SELECT count(*) AS count, count(embedding_model) AS with_model FROM search_blocks
    WHERE embedding IS NOT NULL AND embedding_content_hash = content_hash
  `.execute(getDatabase());
  expect(rows.rows[0]).toEqual({ count: '3', with_model: '3' });
  const second = await createEmbeddingService('fake-model', new FakeEmbeddingProvider()).backfill();
  expect(second).toEqual({ skipped: false, updatedBlocks: 0 });
}

describe.skipIf(databaseUrl === undefined)('hybrid recall and embedding backfill', () => {
  beforeAll(prepareDatabase);
  afterAll(cleanDatabase);

  test(
    'backfill fills vectors idempotently and skips when provider unconfigured',
    verifyBackfillIdempotency,
  );

  test('vector distance orders the identical text first with ownership isolation', async () => {
    await backfillAllWithFake();
    const [queryEmbedding] = await new FakeEmbeddingProvider().embed([docVectorText]);
    const rows = await readHybridRecallRows(getDatabase(), {
      knowledgeBaseId,
      limit: 8,
      ownerId: LOCAL_USER_ID,
      query: docVectorText,
      queryEmbedding: queryEmbedding ?? null,
    });
    expect(rows[0]?.text).toBe(docVectorText);
    expect(rows.map((row) => row.document_title)).not.toContain('他人文档');
    expect(rows[0]?.heading_path).toEqual([]);
    expect(rows[0]?.document_title).toBe('向量文档');
  });

  test('falls back to pure FTS recall when query embedding is null', async () => {
    const rows = await readHybridRecallRows(getDatabase(), {
      knowledgeBaseId,
      limit: 8,
      ownerId: LOCAL_USER_ID,
      query: '全文检索',
      queryEmbedding: null,
    });
    expect(rows.map((row) => row.text)).toContain(docFtsText);
    expect(rows.map((row) => row.document_title)).not.toContain('他人文档');
  });

  test('hybrid recall returns multi-block results across documents', async () => {
    const [queryEmbedding] = await new FakeEmbeddingProvider().embed(['语义召回']);
    const rows = await readHybridRecallRows(getDatabase(), {
      knowledgeBaseId,
      limit: 8,
      ownerId: LOCAL_USER_ID,
      query: '语义召回',
      queryEmbedding: queryEmbedding ?? null,
    });
    expect(new Set(rows.map((row) => row.document_id)).size).toBe(2);
  });
});
