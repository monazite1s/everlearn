/**
 * @fileoverview 创建资讯订阅、已见条目与简报运行三张状态表。
 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import type { Migration } from 'kysely/migration' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database.types';

const UP_STATEMENTS = [
  `CREATE TABLE news_subscriptions (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name text NOT NULL CONSTRAINT news_subscriptions_name_present CHECK (length(btrim(name)) BETWEEN 1 AND 120),
    feed_url text NOT NULL CONSTRAINT news_subscriptions_feed_url_valid CHECK (feed_url ~ '^https?://'),
    include_keywords text[] NOT NULL DEFAULT '{}',
    exclude_keywords text[] NOT NULL DEFAULT '{}',
    schedule jsonb CONSTRAINT news_subscriptions_schedule_valid
      CHECK (schedule IS NULL OR (jsonb_typeof(schedule) = 'object' AND schedule ? 'kind' AND schedule ? 'time' AND schedule ? 'timezone')),
    news_knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases (id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()
  )`,
  `CREATE INDEX news_subscriptions_owner_idx ON news_subscriptions (owner_id, created_at DESC, id)`,
  `CREATE TABLE news_seen_items (
    subscription_id uuid NOT NULL REFERENCES news_subscriptions (id) ON DELETE CASCADE,
    normalized_url text NOT NULL,
    content_hash text NOT NULL CONSTRAINT news_seen_items_hash_valid CHECK (length(content_hash) = 64),
    seen_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT news_seen_items_subscription_hash_unique UNIQUE (subscription_id, content_hash)
  )`,
  `CREATE INDEX news_seen_items_subscription_idx ON news_seen_items (subscription_id, seen_at DESC)`,
  `CREATE TABLE news_digest_runs (
    id uuid PRIMARY KEY,
    subscription_id uuid NOT NULL REFERENCES news_subscriptions (id) ON DELETE CASCADE,
    owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status text NOT NULL CONSTRAINT news_digest_runs_status_valid
      CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
    brief_document_id uuid,
    error_code text CONSTRAINT news_digest_runs_error_code_valid
      CHECK (error_code IS NULL OR length(btrim(error_code)) BETWEEN 1 AND 120),
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()
  )`,
  `CREATE INDEX news_digest_runs_subscription_idx ON news_digest_runs (subscription_id, created_at DESC, id)`,
  `CREATE INDEX news_digest_runs_pending_idx ON news_digest_runs (created_at, id) WHERE status = 'pending'`,
] as const;

const DOWN_STATEMENTS = [
  'DROP TABLE news_digest_runs',
  'DROP TABLE news_seen_items',
  'DROP TABLE news_subscriptions',
] as const;

/** 用于在 Kysely Migrator 事务中按声明顺序执行静态 DDL。 */
async function executeStatements(
  database: Kysely<DatabaseSchema>,
  statements: readonly string[],
): Promise<void> {
  const { sql } = await import('kysely');
  for (const statement of statements) await sql.raw(statement).execute(database);
}

export const newsSchemaMigration: Migration = {
  /** 用于原子创建资讯状态表、约束及已知查询索引。 */
  async up(database): Promise<void> {
    await executeStatements(database, UP_STATEMENTS);
  },
  /** 用于按外键逆序删除本迁移创建的关系。 */
  async down(database): Promise<void> {
    await executeStatements(database, DOWN_STATEMENTS);
  },
};
