/** @fileoverview 创建标签、文档标签关联与文档内部链接表及其级联不变量。 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import type { Migration } from 'kysely/migration' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database.types';

const UP_STATEMENTS = [
  `CREATE TABLE tags (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name text NOT NULL CONSTRAINT tags_name_present
      CHECK (length(btrim(name)) BETWEEN 1 AND 50),
    canonical text NOT NULL CONSTRAINT tags_canonical_present
      CHECK (length(canonical) BETWEEN 1 AND 50),
    CONSTRAINT tags_owner_canonical_unique UNIQUE (owner_id, canonical)
  )`,
  `CREATE TABLE document_tags (
    document_id uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    CONSTRAINT document_tags_document_tag_unique UNIQUE (document_id, tag_id)
  )`,
  `CREATE INDEX document_tags_tag_document_idx ON document_tags (tag_id, document_id)`,
  // 目标文档列不设外键：目标被删后保留反链行，由查询时 join 判定失效来源。
  `CREATE TABLE document_links (
    source_document_id uuid NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
    source_block_id uuid,
    target_document_id uuid NOT NULL,
    CONSTRAINT document_links_source_block_target_unique
      UNIQUE (source_document_id, source_block_id, target_document_id)
  )`,
  `CREATE INDEX document_links_target_source_idx
    ON document_links (target_document_id, source_document_id)`,
] as const;

const DOWN_STATEMENTS = [
  'DROP TABLE document_links',
  'DROP TABLE document_tags',
  'DROP TABLE tags',
] as const;

/** 用于在 Kysely Migrator 管理的事务内执行静态 SQL。 */
async function executeStatements(
  database: Kysely<DatabaseSchema>,
  statements: readonly string[],
): Promise<void> {
  const { sql } = await import('kysely');
  for (const statement of statements) await sql.raw(statement).execute(database);
}

export const documentTagsLinksMigration: Migration = {
  /** 用于创建标签与内部链接表、级联外键及反链查询索引。 */
  async up(database): Promise<void> {
    await executeStatements(database, UP_STATEMENTS);
  },
  /** 用于按依赖逆序删除内部链接、文档标签与标签表。 */
  async down(database): Promise<void> {
    await executeStatements(database, DOWN_STATEMENTS);
  },
};
