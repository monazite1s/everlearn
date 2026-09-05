/**
 * @fileoverview 创建资讯条目流表并登记订阅内指纹唯一约束与查询索引。
 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import type { Migration } from 'kysely/migration' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database.types';

const UP_STATEMENTS = [
  `CREATE TABLE news_items (
    id uuid PRIMARY KEY,
    subscription_id uuid NOT NULL REFERENCES news_subscriptions (id) ON DELETE CASCADE,
    owner_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    url text NOT NULL CONSTRAINT news_items_url_valid CHECK (length(btrim(url)) BETWEEN 1 AND 2048),
    title text NOT NULL CONSTRAINT news_items_title_present CHECK (length(btrim(title)) BETWEEN 1 AND 500),
    snippet text NOT NULL DEFAULT '' CONSTRAINT news_items_snippet_valid CHECK (length(snippet) <= 2000),
    topic text NOT NULL CONSTRAINT news_items_topic_present CHECK (length(btrim(topic)) BETWEEN 1 AND 200),
    source_type text NOT NULL CONSTRAINT news_items_source_type_valid CHECK (source_type IN ('rss', 'search')),
    relevance text NOT NULL DEFAULT 'accepted' CONSTRAINT news_items_relevance_valid
      CHECK (relevance IN ('accepted', 'rejected')),
    importance text CONSTRAINT news_items_importance_valid
      CHECK (importance IS NULL OR importance IN ('high', 'normal', 'low')),
    CONSTRAINT news_items_judgement_paired CHECK (
      (relevance = 'rejected' AND importance IS NULL)
      OR (relevance = 'accepted' AND importance IS NOT NULL)
    ),
    published_at timestamptz,
    discovered_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    processed_content text NOT NULL DEFAULT '' CONSTRAINT news_items_processed_content_valid
      CHECK (length(processed_content) <= 2000),
    content_fingerprint text NOT NULL CONSTRAINT news_items_fingerprint_valid CHECK (length(content_fingerprint) = 64),
    discovered_run_id uuid REFERENCES news_digest_runs (id) ON DELETE SET NULL,
    CONSTRAINT news_items_subscription_fingerprint_unique UNIQUE (subscription_id, content_fingerprint)
  )`,
  `CREATE INDEX news_items_owner_discovered_idx ON news_items (owner_id, discovered_at DESC, id DESC)`,
  `CREATE INDEX news_items_subscription_discovered_idx ON news_items (subscription_id, discovered_at DESC, id DESC)`,
  `CREATE INDEX news_items_owner_importance_idx ON news_items (owner_id, importance, discovered_at DESC, id DESC)`,
  `CREATE INDEX news_items_discovered_run_idx ON news_items (discovered_run_id)`,
] as const;

const DOWN_STATEMENTS = ['DROP TABLE news_items'] as const;

/** 用于在 Kysely Migrator 事务中按声明顺序执行静态 DDL。 */
async function executeStatements(
  database: Kysely<DatabaseSchema>,
  statements: readonly string[],
): Promise<void> {
  const { sql } = await import('kysely');
  for (const statement of statements) await sql.raw(statement).execute(database);
}

export const newsItemsMigration: Migration = {
  /** 用于原子创建资讯条目表、约束及条目流查询索引。 */
  async up(database): Promise<void> {
    await executeStatements(database, UP_STATEMENTS);
  },
  /** 用于删除本迁移创建的资讯条目表。 */
  async down(database): Promise<void> {
    await executeStatements(database, DOWN_STATEMENTS);
  },
};
