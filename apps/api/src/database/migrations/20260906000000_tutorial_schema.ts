/**
 * @fileoverview 创建教程会话与教程章节两张状态表。
 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import type { Migration } from 'kysely/migration' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database.types';

const UP_STATEMENTS = [
  `CREATE TABLE tutorial_sessions (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    topic text NOT NULL CONSTRAINT tutorial_sessions_topic_present CHECK (length(btrim(topic)) BETWEEN 1 AND 200),
    audience text NOT NULL CONSTRAINT tutorial_sessions_audience_present CHECK (length(btrim(audience)) BETWEEN 1 AND 200),
    level int NOT NULL CONSTRAINT tutorial_sessions_level_range CHECK (level BETWEEN 1 AND 100),
    goals text NOT NULL DEFAULT '',
    depth text NOT NULL CONSTRAINT tutorial_sessions_depth_valid CHECK (depth IN ('overview', 'standard', 'deep')),
    include_topics text[] NOT NULL DEFAULT '{}',
    exclude_topics text[] NOT NULL DEFAULT '{}',
    kb_scope uuid[] NOT NULL DEFAULT '{}',
    status text NOT NULL CONSTRAINT tutorial_sessions_status_valid
      CHECK (status IN ('draft', 'researching', 'outline_ready', 'generating', 'partial', 'completed', 'failed', 'canceled')),
    outline jsonb CONSTRAINT tutorial_sessions_outline_valid CHECK (outline IS NULL OR jsonb_typeof(outline) = 'object'),
    tutorial_kb_id uuid,
    warnings jsonb NOT NULL DEFAULT '[]' CONSTRAINT tutorial_sessions_warnings_valid CHECK (jsonb_typeof(warnings) = 'array'),
    error_code text CONSTRAINT tutorial_sessions_error_code_valid
      CHECK (error_code IS NULL OR length(btrim(error_code)) BETWEEN 1 AND 120),
    outline_locked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()
  )`,
  `CREATE INDEX tutorial_sessions_owner_idx ON tutorial_sessions (owner_id, created_at DESC, id)`,
  `CREATE INDEX tutorial_sessions_researching_idx ON tutorial_sessions (created_at, id) WHERE status = 'researching'`,
  `CREATE TABLE tutorial_chapters (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES tutorial_sessions (id) ON DELETE CASCADE,
    node_key text NOT NULL CONSTRAINT tutorial_chapters_node_key_present CHECK (length(btrim(node_key)) BETWEEN 1 AND 120),
    title text NOT NULL CONSTRAINT tutorial_chapters_title_present CHECK (length(btrim(title)) BETWEEN 1 AND 200),
    depends_on text[] NOT NULL DEFAULT '{}',
    status text NOT NULL CONSTRAINT tutorial_chapters_status_valid
      CHECK (status IN ('pending', 'generating', 'succeeded', 'failed', 'canceled')),
    document_id uuid,
    attempt int NOT NULL DEFAULT 0 CONSTRAINT tutorial_chapters_attempt_non_negative CHECK (attempt >= 0),
    error_code text CONSTRAINT tutorial_chapters_error_code_valid
      CHECK (error_code IS NULL OR length(btrim(error_code)) BETWEEN 1 AND 120),
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT tutorial_chapters_session_node_key_unique UNIQUE (session_id, node_key)
  )`,
  `CREATE INDEX tutorial_chapters_pending_idx ON tutorial_chapters (session_id, created_at, id) WHERE status = 'pending'`,
] as const;

const DOWN_STATEMENTS = ['DROP TABLE tutorial_chapters', 'DROP TABLE tutorial_sessions'] as const;

/** 用于在 Kysely Migrator 事务中按声明顺序执行静态 DDL。 */
async function executeStatements(
  database: Kysely<DatabaseSchema>,
  statements: readonly string[],
): Promise<void> {
  const { sql } = await import('kysely');
  for (const statement of statements) await sql.raw(statement).execute(database);
}

export const tutorialSchemaMigration: Migration = {
  /** 用于原子创建教程会话与章节表、约束及已知查询索引。 */
  async up(database): Promise<void> {
    await executeStatements(database, UP_STATEMENTS);
  },
  /** 用于按外键逆序删除本迁移创建的关系。 */
  async down(database): Promise<void> {
    await executeStatements(database, DOWN_STATEMENTS);
  },
};
