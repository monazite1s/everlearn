/** @fileoverview 为有效文档标题检索与当前知识库更新时间范围新增三个查询索引。 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import type { Migration } from 'kysely/migration' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database.types';

const UP_STATEMENTS = [
  `CREATE INDEX documents_active_title_vector_idx
    ON documents USING gin (to_tsvector('pg_catalog.simple'::regconfig, title))
    WHERE deleted_at IS NULL`,
  `CREATE INDEX documents_active_title_trgm_idx
    ON documents USING gin (title public.gin_trgm_ops)
    WHERE deleted_at IS NULL`,
  `CREATE INDEX documents_owner_base_active_updated_idx
    ON documents (owner_id, knowledge_base_id, updated_at DESC, id)
    WHERE deleted_at IS NULL`,
] as const;

const DOWN_STATEMENTS = [
  'DROP INDEX documents_owner_base_active_updated_idx',
  'DROP INDEX documents_active_title_trgm_idx',
  'DROP INDEX documents_active_title_vector_idx',
] as const;

/** 用于在 Migrator 事务中执行不含动态输入的静态索引 DDL。 */
async function executeStatements(
  database: Kysely<DatabaseSchema>,
  statements: readonly string[],
): Promise<void> {
  const { sql } = await import('kysely');
  for (const statement of statements) await sql.raw(statement).execute(database);
}

export const searchQueryIndexesMigration: Migration = {
  /** 用于原子添加三个只服务已确认搜索查询的非破坏性索引。 */
  async up(database): Promise<void> {
    await executeStatements(database, UP_STATEMENTS);
  },
  /** 用于在隔离环境按创建逆序移除 SEARCH-02 索引。 */
  async down(database): Promise<void> {
    await executeStatements(database, DOWN_STATEMENTS);
  },
};
