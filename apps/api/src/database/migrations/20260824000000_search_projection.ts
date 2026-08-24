/** @fileoverview 创建可靠 Outbox、文档索引状态与 PostgreSQL 搜索块投影。 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import type { Migration } from 'kysely/migration' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database.types';

const UP_STATEMENTS = [
  'CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public',
  `CREATE TABLE outbox_events (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    event_type text NOT NULL CONSTRAINT outbox_events_type_valid
      CHECK (event_type IN ('document.saved', 'document.deleted', 'document.restored')),
    aggregate_id uuid NOT NULL,
    aggregate_version integer NOT NULL CONSTRAINT outbox_events_aggregate_version_valid
      CHECK (aggregate_version >= 1),
    schema_version smallint NOT NULL CONSTRAINT outbox_events_schema_version_valid
      CHECK (schema_version >= 1),
    payload jsonb NOT NULL CONSTRAINT outbox_events_payload_valid
      CHECK (jsonb_typeof(payload) = 'object'),
    occurred_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    available_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    attempt_count integer NOT NULL DEFAULT 0 CONSTRAINT outbox_events_attempt_count_valid
      CHECK (attempt_count >= 0),
    processed_at timestamptz,
    failed_at timestamptz,
    last_error_code text CONSTRAINT outbox_events_last_error_code_valid
      CHECK (last_error_code IS NULL OR length(btrim(last_error_code)) BETWEEN 1 AND 120),
    CONSTRAINT outbox_events_owner_type_aggregate_version_unique
      UNIQUE (owner_id, event_type, aggregate_id, aggregate_version),
    CONSTRAINT outbox_events_terminal_state_valid CHECK (
      NOT (processed_at IS NOT NULL AND failed_at IS NOT NULL)
      AND (processed_at IS NULL OR processed_at >= occurred_at)
      AND (failed_at IS NULL OR failed_at >= occurred_at)
      AND (failed_at IS NULL OR last_error_code IS NOT NULL)
    )
  )`,
  `CREATE INDEX outbox_events_pending_idx
    ON outbox_events (available_at, occurred_at, id)
    WHERE processed_at IS NULL AND failed_at IS NULL`,
  `CREATE TABLE search_document_projections (
    document_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    indexed_document_version integer NOT NULL
      CONSTRAINT search_document_projections_version_valid CHECK (indexed_document_version >= 1),
    indexed_content_hash text NOT NULL
      CONSTRAINT search_document_projections_hash_valid CHECK (indexed_content_hash ~ '^[0-9a-f]{64}$'),
    indexed_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    PRIMARY KEY (document_id, owner_id),
    CONSTRAINT search_document_projections_document_owner_fk
      FOREIGN KEY (document_id, owner_id) REFERENCES documents (id, owner_id) ON DELETE CASCADE
  )`,
  `CREATE TABLE search_blocks (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL,
    document_id uuid NOT NULL,
    document_version integer NOT NULL
      CONSTRAINT search_blocks_document_version_valid CHECK (document_version >= 1),
    block_id uuid NOT NULL,
    block_order integer NOT NULL CONSTRAINT search_blocks_order_valid CHECK (block_order >= 0),
    text text NOT NULL CONSTRAINT search_blocks_text_present CHECK (length(btrim(text)) > 0),
    heading_path text[] NOT NULL DEFAULT '{}'::text[]
      CONSTRAINT search_blocks_heading_path_valid CHECK (
        cardinality(heading_path) <= 4
        AND array_position(heading_path, NULL) IS NULL
        AND array_position(heading_path, '') IS NULL
      ),
    content_hash text NOT NULL
      CONSTRAINT search_blocks_hash_valid CHECK (content_hash ~ '^[0-9a-f]{64}$'),
    search_vector tsvector GENERATED ALWAYS AS
      (to_tsvector('pg_catalog.simple'::regconfig, text)) STORED,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT search_blocks_projection_owner_fk FOREIGN KEY (document_id, owner_id)
      REFERENCES search_document_projections (document_id, owner_id) ON DELETE CASCADE,
    CONSTRAINT search_blocks_document_block_unique UNIQUE (owner_id, document_id, block_id)
  )`,
  'CREATE INDEX search_blocks_vector_idx ON search_blocks USING gin (search_vector)',
  'CREATE INDEX search_blocks_text_trgm_idx ON search_blocks USING gin (text public.gin_trgm_ops)',
] as const;

const DOWN_STATEMENTS = [
  'DROP TABLE search_blocks',
  'DROP TABLE search_document_projections',
  'DROP TABLE outbox_events',
] as const;

/** 用于在 Kysely Migrator 事务中按声明顺序执行静态 DDL。 */
async function executeStatements(
  database: Kysely<DatabaseSchema>,
  statements: readonly string[],
): Promise<void> {
  const { sql } = await import('kysely');
  for (const statement of statements) await sql.raw(statement).execute(database);
}

export const searchProjectionMigration: Migration = {
  /** 用于原子创建搜索投影关系、约束及已知查询索引。 */
  async up(database): Promise<void> {
    await executeStatements(database, UP_STATEMENTS);
  },
  /** 用于按外键逆序删除本迁移关系并保留共享扩展。 */
  async down(database): Promise<void> {
    await executeStatements(database, DOWN_STATEMENTS);
  },
};
