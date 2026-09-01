/**
 * @fileoverview 创建 Workflow 定义、版本、运行与运行事件四张状态表。
 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import type { Migration } from 'kysely/migration' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database.types';

const UP_STATEMENTS = [
  `CREATE TABLE workflows (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name text NOT NULL CONSTRAINT workflows_name_present CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    schedule jsonb CONSTRAINT workflows_schedule_valid CHECK (schedule IS NULL OR jsonb_typeof(schedule) = 'object'),
    draft_definition jsonb NOT NULL CONSTRAINT workflows_draft_definition_valid CHECK (jsonb_typeof(draft_definition) = 'object'),
    published_version_id uuid,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()
  )`,
  `CREATE INDEX workflows_owner_idx ON workflows (owner_id, created_at, id)`,
  `CREATE TABLE workflow_versions (
    id uuid PRIMARY KEY,
    workflow_id uuid NOT NULL REFERENCES workflows (id) ON DELETE CASCADE,
    version integer NOT NULL CONSTRAINT workflow_versions_version_valid CHECK (version >= 1),
    definition jsonb NOT NULL CONSTRAINT workflow_versions_definition_valid CHECK (jsonb_typeof(definition) = 'object'),
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT workflow_versions_workflow_version_unique UNIQUE (workflow_id, version)
  )`,
  `ALTER TABLE workflows
    ADD CONSTRAINT workflows_published_version_fk FOREIGN KEY (published_version_id)
    REFERENCES workflow_versions (id) ON DELETE SET NULL`,
  `CREATE TABLE workflow_runs (
    id uuid PRIMARY KEY,
    workflow_id uuid NOT NULL REFERENCES workflows (id) ON DELETE CASCADE,
    version_id uuid NOT NULL REFERENCES workflow_versions (id) ON DELETE RESTRICT,
    owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status text NOT NULL CONSTRAINT workflow_runs_status_valid
      CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'canceled')),
    output_summary text,
    error_code text CONSTRAINT workflow_runs_error_code_valid
      CHECK (error_code IS NULL OR length(btrim(error_code)) BETWEEN 1 AND 120),
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()
  )`,
  `CREATE INDEX workflow_runs_workflow_idx ON workflow_runs (workflow_id, created_at DESC, id)`,
  `CREATE INDEX workflow_runs_pending_idx ON workflow_runs (created_at, id) WHERE status = 'pending'`,
  `CREATE TABLE workflow_run_events (
    id uuid PRIMARY KEY,
    run_id uuid NOT NULL REFERENCES workflow_runs (id) ON DELETE CASCADE,
    seq integer NOT NULL CONSTRAINT workflow_run_events_seq_valid CHECK (seq >= 1),
    node_id text NOT NULL CONSTRAINT workflow_run_events_node_present CHECK (length(btrim(node_id)) BETWEEN 1 AND 64),
    status text NOT NULL CONSTRAINT workflow_run_events_status_valid
      CHECK (status IN ('running', 'succeeded', 'failed')),
    message text,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT workflow_run_events_run_seq_unique UNIQUE (run_id, seq)
  )`,
] as const;

const DOWN_STATEMENTS = [
  'DROP TABLE workflow_run_events',
  'DROP TABLE workflow_runs',
  'ALTER TABLE workflows DROP CONSTRAINT workflows_published_version_fk',
  'DROP TABLE workflow_versions',
  'DROP TABLE workflows',
] as const;

/** 用于在 Kysely Migrator 事务中按声明顺序执行静态 DDL。 */
async function executeStatements(
  database: Kysely<DatabaseSchema>,
  statements: readonly string[],
): Promise<void> {
  const { sql } = await import('kysely');
  for (const statement of statements) await sql.raw(statement).execute(database);
}

export const workflowRuntimeMigration: Migration = {
  /** 用于原子创建 Workflow 状态表、约束及已知查询索引。 */
  async up(database): Promise<void> {
    await executeStatements(database, UP_STATEMENTS);
  },
  /** 用于按外键逆序删除本迁移创建的关系。 */
  async down(database): Promise<void> {
    await executeStatements(database, DOWN_STATEMENTS);
  },
};
