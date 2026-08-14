/** @fileoverview 创建初始身份、知识库关系及数据库不变量。 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import type { Migration } from 'kysely/migration' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database.types';

const UP_STATEMENTS = [
  `CREATE TABLE users (
    id uuid PRIMARY KEY,
    display_name text NOT NULL CONSTRAINT users_display_name_present CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
    timezone text NOT NULL CONSTRAINT users_timezone_present CHECK (length(btrim(timezone)) BETWEEN 1 AND 255),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE knowledge_bases (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name text NOT NULL CONSTRAINT knowledge_bases_name_present CHECK (length(btrim(name)) BETWEEN 1 AND 200),
    description text NOT NULL DEFAULT '',
    kind text NOT NULL CONSTRAINT knowledge_bases_kind_valid CHECK (kind IN ('normal', 'news', 'tutorial')),
    version integer NOT NULL DEFAULT 1 CONSTRAINT knowledge_bases_version_valid CHECK (version >= 1),
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT knowledge_bases_id_owner_unique UNIQUE (id, owner_id)
  )`,
  `CREATE INDEX knowledge_bases_owner_updated_idx
    ON knowledge_bases (owner_id, updated_at DESC, id)`,
  `CREATE TABLE documents (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    knowledge_base_id uuid NOT NULL,
    parent_id uuid,
    path text NOT NULL,
    position bigint NOT NULL CONSTRAINT documents_position_valid CHECK (position >= 0),
    title text NOT NULL CONSTRAINT documents_title_present CHECK (length(btrim(title)) BETWEEN 1 AND 500),
    content_json jsonb NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,
    schema_version integer NOT NULL DEFAULT 1 CONSTRAINT documents_schema_version_valid CHECK (schema_version >= 1),
    plain_text text NOT NULL DEFAULT '',
    version integer NOT NULL DEFAULT 1 CONSTRAINT documents_version_valid CHECK (version >= 1),
    deleted_at timestamptz,
    deleted_parent_id uuid,
    deleted_position bigint,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT documents_id_owner_unique UNIQUE (id, owner_id),
    CONSTRAINT documents_id_owner_base_unique UNIQUE (id, owner_id, knowledge_base_id),
    CONSTRAINT documents_base_owner_fk FOREIGN KEY (knowledge_base_id, owner_id)
      REFERENCES knowledge_bases (id, owner_id) ON DELETE CASCADE,
    CONSTRAINT documents_parent_scope_fk FOREIGN KEY (parent_id, owner_id, knowledge_base_id)
      REFERENCES documents (id, owner_id, knowledge_base_id) ON DELETE CASCADE,
    CONSTRAINT documents_parent_not_self CHECK (parent_id IS NULL OR parent_id <> id),
    CONSTRAINT documents_path_valid CHECK (
      path ~ '^(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})+$'
      AND right(path, 36) = id::text
    ),
    CONSTRAINT documents_content_valid CHECK (
      jsonb_typeof(content_json) = 'object'
      AND content_json ->> 'type' = 'doc'
      AND (NOT content_json ? 'content' OR jsonb_typeof(content_json -> 'content') = 'array')
    ),
    CONSTRAINT documents_deleted_state_valid CHECK (
      (deleted_at IS NULL AND deleted_parent_id IS NULL AND deleted_position IS NULL)
      OR (deleted_at IS NOT NULL AND deleted_position IS NOT NULL)
    )
  )`,
  `CREATE INDEX documents_parent_position_idx
    ON documents (knowledge_base_id, parent_id, position, id)`,
  `CREATE INDEX documents_owner_deleted_idx
    ON documents (owner_id, deleted_at, updated_at DESC, id)`,
  `CREATE TABLE document_revisions (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    document_id uuid NOT NULL,
    revision_number integer NOT NULL CONSTRAINT document_revisions_number_valid CHECK (revision_number >= 1),
    source text NOT NULL CONSTRAINT document_revisions_source_valid
      CHECK (source IN ('manual', 'ai', 'import', 'restore', 'automation')),
    content_json jsonb NOT NULL,
    schema_version integer NOT NULL CONSTRAINT document_revisions_schema_version_valid CHECK (schema_version >= 1),
    plain_text text NOT NULL,
    created_by uuid NOT NULL REFERENCES users (id),
    generation_id uuid,
    workflow_run_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT document_revisions_document_owner_fk FOREIGN KEY (document_id, owner_id)
      REFERENCES documents (id, owner_id) ON DELETE CASCADE,
    CONSTRAINT document_revisions_document_number_unique UNIQUE (document_id, revision_number),
    CONSTRAINT document_revisions_content_valid CHECK (
      jsonb_typeof(content_json) = 'object'
      AND content_json ->> 'type' = 'doc'
      AND (NOT content_json ? 'content' OR jsonb_typeof(content_json -> 'content') = 'array')
    )
  )`,
  `CREATE INDEX document_revisions_owner_created_idx
    ON document_revisions (owner_id, created_at DESC, id)`,
  `CREATE TABLE inbox_items (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind text NOT NULL CONSTRAINT inbox_items_kind_valid CHECK (kind IN ('text', 'url')),
    content text NOT NULL CONSTRAINT inbox_items_content_present CHECK (length(btrim(content)) > 0),
    status text NOT NULL DEFAULT 'pending' CONSTRAINT inbox_items_status_valid CHECK (status IN ('pending', 'converted')),
    converted_document_id uuid,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT inbox_items_document_owner_fk FOREIGN KEY (converted_document_id, owner_id)
      REFERENCES documents (id, owner_id),
    CONSTRAINT inbox_items_conversion_state_valid CHECK (
      (status = 'pending' AND converted_document_id IS NULL)
      OR (status = 'converted' AND converted_document_id IS NOT NULL)
    )
  )`,
  `CREATE INDEX inbox_items_owner_status_idx
    ON inbox_items (owner_id, status, created_at DESC, id)`,
  `CREATE TABLE idempotency_records (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    operation text NOT NULL CONSTRAINT idempotency_records_operation_present CHECK (length(btrim(operation)) > 0),
    idempotency_key text NOT NULL CONSTRAINT idempotency_records_key_present CHECK (length(btrim(idempotency_key)) > 0),
    request_hash text NOT NULL CONSTRAINT idempotency_records_hash_present CHECK (length(btrim(request_hash)) > 0),
    response_json jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT idempotency_records_owner_operation_key_unique UNIQUE (owner_id, operation, idempotency_key)
  )`,
] as const;

const DOWN_STATEMENTS = [
  'DROP TABLE idempotency_records',
  'DROP TABLE inbox_items',
  'DROP TABLE document_revisions',
  'DROP TABLE documents',
  'DROP TABLE knowledge_bases',
  'DROP TABLE users',
] as const;

/** 用于在 Kysely Migrator 管理的事务内执行静态 SQL。 */
async function executeStatements(
  database: Kysely<DatabaseSchema>,
  statements: readonly string[],
): Promise<void> {
  const { sql } = await import('kysely');
  for (const statement of statements) await sql.raw(statement).execute(database);
}

export const identityKnowledgeSchemaMigration: Migration = {
  /** 用于按依赖顺序创建用户所有的知识库关系。 */
  async up(database): Promise<void> {
    await executeStatements(database, UP_STATEMENTS);
  },
  /** 用于按反向依赖顺序删除知识库关系。 */
  async down(database): Promise<void> {
    await executeStatements(database, DOWN_STATEMENTS);
  },
};
