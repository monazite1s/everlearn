/** @fileoverview 为 search_blocks 增加 pgvector 向量列与余弦距离 HNSW 索引。 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import type { Migration } from 'kysely/migration' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database.types';

/** 用于在 Migrator 事务中执行单条静态 DDL。 */
async function execute(database: Kysely<DatabaseSchema>, statement: string): Promise<void> {
  const { sql } = await import('kysely');
  await sql.raw(statement).execute(database);
}

/** 用于读取向量扩展类型实际安装的 Schema 以便在受限搜索路径下限定引用。 */
async function readVectorSchema(database: Kysely<DatabaseSchema>): Promise<string> {
  const { sql } = await import('kysely');
  const result = await sql<{ schema_name: string }>`
    SELECT n.nspname AS schema_name FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'vector'
  `.execute(database);
  return result.rows[0]?.schema_name ?? 'public';
}

export const searchEmbeddingsMigration: Migration = {
  /** 用于启用 pgvector 并为搜索块追加向量、模型与内容哈希列及降级可选的 HNSW 索引。 */
  async up(database): Promise<void> {
    await execute(database, 'CREATE EXTENSION IF NOT EXISTS vector');
    const extSchema = await readVectorSchema(database);
    await execute(
      database,
      `ALTER TABLE search_blocks ADD COLUMN embedding ${extSchema}.vector(1536)`,
    );
    await execute(database, 'ALTER TABLE search_blocks ADD COLUMN embedding_model text');
    await execute(database, 'ALTER TABLE search_blocks ADD COLUMN embedding_content_hash text');
    try {
      await execute(
        database,
        `CREATE INDEX search_blocks_embedding_hnsw_idx ON search_blocks
          USING hnsw (embedding ${extSchema}.vector_cosine_ops) WHERE embedding IS NOT NULL`,
      );
    } catch {
      // ponytail: 个别 pgvector 构建不支持 HNSW 时降级为无向量索引，回退到全表顺序扫描；
      // 块级数据量成为检索延迟瓶颈时再补建 ivfflat 或重建 HNSW。
    }
  },
  /** 用于按创建逆序移除向量索引与三列，保留已安装的扩展。 */
  async down(database): Promise<void> {
    await execute(database, 'DROP INDEX IF EXISTS search_blocks_embedding_hnsw_idx');
    await execute(database, 'ALTER TABLE search_blocks DROP COLUMN embedding_content_hash');
    await execute(database, 'ALTER TABLE search_blocks DROP COLUMN embedding_model');
    await execute(database, 'ALTER TABLE search_blocks DROP COLUMN embedding');
  },
};
