/** @fileoverview 为不可变修订快照补充标题列并回填既有行。 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import type { Migration } from 'kysely/migration' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database.types';

const UP_STATEMENTS = [
  `ALTER TABLE document_revisions ADD COLUMN title text`,
  `UPDATE document_revisions r
    SET title = d.title
    FROM documents d
    WHERE d.id = r.document_id AND d.owner_id = r.owner_id`,
  `ALTER TABLE document_revisions
    ALTER COLUMN title SET NOT NULL,
    ADD CONSTRAINT document_revisions_title_present
      CHECK (length(btrim(title)) BETWEEN 1 AND 200)`,
] as const;

const DOWN_STATEMENTS = [
  `ALTER TABLE document_revisions
    DROP CONSTRAINT document_revisions_title_present,
    DROP COLUMN title`,
] as const;

/** 用于在 Kysely Migrator 管理的事务内执行静态 SQL。 */
async function executeStatements(
  database: Kysely<DatabaseSchema>,
  statements: readonly string[],
): Promise<void> {
  const { sql } = await import('kysely');
  for (const statement of statements) await sql.raw(statement).execute(database);
}

export const documentRevisionTitleMigration: Migration = {
  /** 用于先回填存量修订再收紧非空与长度约束。 */
  async up(database): Promise<void> {
    await executeStatements(database, UP_STATEMENTS);
  },
  /** 用于删除修订标题列且不影响其他快照数据。 */
  async down(database): Promise<void> {
    await executeStatements(database, DOWN_STATEMENTS);
  },
};
