/** @fileoverview 为回收站投影与到期清理扫描添加部分索引。 */

import type { Kysely } from 'kysely' with {
  'resolution-mode': 'import',
};
import type { Migration } from 'kysely/migration' with {
  'resolution-mode': 'import',
};

import type { DatabaseSchema } from '../database.types';

const UP_STATEMENTS = [
  `CREATE INDEX documents_trash_idx
    ON documents (owner_id, deleted_at DESC, id DESC)
    WHERE deleted_at IS NOT NULL`,
  `CREATE INDEX knowledge_bases_trash_idx
    ON knowledge_bases (owner_id, deleted_at DESC, id DESC)
    WHERE deleted_at IS NOT NULL`,
] as const;

const DOWN_STATEMENTS = [
  'DROP INDEX documents_trash_idx',
  'DROP INDEX knowledge_bases_trash_idx',
] as const;

/** 用于在 Kysely Migrator 管理的事务内执行静态 SQL。 */
async function executeStatements(
  database: Kysely<DatabaseSchema>,
  statements: readonly string[],
): Promise<void> {
  const { sql } = await import('kysely');
  for (const statement of statements) await sql.raw(statement).execute(database);
}

export const trashRetentionIndexesMigration: Migration = {
  /** 用于按删除时间倒序服务回收站列表与保留期清理查询。 */
  async up(database): Promise<void> {
    await executeStatements(database, UP_STATEMENTS);
  },
  /** 用于移除回收站部分索引且不改写任何数据行。 */
  async down(database): Promise<void> {
    await executeStatements(database, DOWN_STATEMENTS);
  },
};
