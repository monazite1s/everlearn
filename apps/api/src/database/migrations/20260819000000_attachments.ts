/** @fileoverview 创建附件对象行及其生命周期与孤儿清理不变量。 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import type { Migration } from 'kysely/migration' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database.types';

const UP_STATEMENTS = [
  `CREATE TABLE attachments (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    object_key text NOT NULL CONSTRAINT attachments_object_key_present
      CHECK (length(btrim(object_key)) BETWEEN 1 AND 500),
    file_name text NOT NULL CONSTRAINT attachments_file_name_present
      CHECK (length(btrim(file_name)) BETWEEN 1 AND 255),
    mime_type text NOT NULL CONSTRAINT attachments_mime_type_present
      CHECK (length(btrim(mime_type)) BETWEEN 3 AND 255),
    kind text NOT NULL CONSTRAINT attachments_kind_valid CHECK (kind IN ('image', 'file')),
    size_bytes bigint NOT NULL CONSTRAINT attachments_size_valid
      CHECK (size_bytes BETWEEN 1 AND 26214400),
    sha256 text CONSTRAINT attachments_sha256_format CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
    status text NOT NULL CONSTRAINT attachments_status_valid CHECK (status IN ('pending', 'active')),
    reference_count integer NOT NULL DEFAULT 0 CONSTRAINT attachments_reference_count_valid
      CHECK (reference_count >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT attachments_id_owner_unique UNIQUE (id, owner_id),
    CONSTRAINT attachments_lifecycle_valid CHECK (
      (status = 'pending' AND reference_count = 0)
      OR (status = 'active' AND reference_count > 0)
    )
  )`,
  `CREATE INDEX attachments_pending_sweep_idx
    ON attachments (updated_at, id) WHERE status = 'pending'`,
] as const;

const DOWN_STATEMENTS = ['DROP TABLE attachments'] as const;

/** 用于在 Kysely Migrator 管理的事务内执行静态 SQL。 */
async function executeStatements(
  database: Kysely<DatabaseSchema>,
  statements: readonly string[],
): Promise<void> {
  const { sql } = await import('kysely');
  for (const statement of statements) await sql.raw(statement).execute(database);
}

export const attachmentsMigration: Migration = {
  /** 用于创建附件表、生命周期约束与孤儿清理部分索引。 */
  async up(database): Promise<void> {
    await executeStatements(database, UP_STATEMENTS);
  },
  /** 用于删除附件表及其全部索引与约束。 */
  async down(database): Promise<void> {
    await executeStatements(database, DOWN_STATEMENTS);
  },
};
