/**
 * @fileoverview 扩展资讯订阅（主题、色槽、启停、乐观版本）并创建多来源配置表。
 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import type { Migration } from 'kysely/migration' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database.types';

const UP_STATEMENTS = [
  `ALTER TABLE news_subscriptions
    ADD COLUMN topic text NOT NULL DEFAULT '' CONSTRAINT news_subscriptions_topic_valid
      CHECK (length(topic) <= 200)`,
  `ALTER TABLE news_subscriptions
    ADD COLUMN color_slot int NOT NULL DEFAULT 1 CONSTRAINT news_subscriptions_color_slot_valid
      CHECK (color_slot BETWEEN 1 AND 5)`,
  `ALTER TABLE news_subscriptions
    ADD COLUMN enabled boolean NOT NULL DEFAULT true`,
  `ALTER TABLE news_subscriptions
    ADD COLUMN version int NOT NULL DEFAULT 1 CONSTRAINT news_subscriptions_version_positive
      CHECK (version >= 1)`,
  `ALTER TABLE news_subscriptions DROP CONSTRAINT news_subscriptions_feed_url_valid`,
  `ALTER TABLE news_subscriptions DROP COLUMN feed_url`,
  `CREATE TABLE news_sources (
    id uuid PRIMARY KEY,
    subscription_id uuid NOT NULL REFERENCES news_subscriptions (id) ON DELETE CASCADE,
    type text NOT NULL CONSTRAINT news_sources_type_valid CHECK (type IN ('rss', 'site', 'search')),
    value text NOT NULL CONSTRAINT news_sources_value_valid
      CHECK (length(btrim(value)) BETWEEN 1 AND 2048),
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT news_sources_subscription_unique UNIQUE (subscription_id, type, value)
  )`,
  `CREATE INDEX news_sources_subscription_idx ON news_sources (subscription_id, created_at, id)`,
] as const;

const DOWN_STATEMENTS = [
  'DROP TABLE news_sources',
  `ALTER TABLE news_subscriptions ADD COLUMN feed_url text NOT NULL DEFAULT 'https://example.com/feed'`,
  `ALTER TABLE news_subscriptions
    ADD CONSTRAINT news_subscriptions_feed_url_valid CHECK (feed_url ~ '^https?://')`,
  'ALTER TABLE news_subscriptions DROP COLUMN version',
  'ALTER TABLE news_subscriptions DROP COLUMN enabled',
  'ALTER TABLE news_subscriptions DROP COLUMN color_slot',
  'ALTER TABLE news_subscriptions DROP COLUMN topic',
] as const;

/** 用于在 Kysely Migrator 事务中按声明顺序执行静态 DDL。 */
async function executeStatements(
  database: Kysely<DatabaseSchema>,
  statements: readonly string[],
): Promise<void> {
  const { sql } = await import('kysely');
  for (const statement of statements) await sql.raw(statement).execute(database);
}

export const newsSubscriptionSourcesMigration: Migration = {
  /** 用于扩展订阅列并原子创建多来源配置表。 */
  async up(database): Promise<void> {
    await executeStatements(database, UP_STATEMENTS);
  },
  /** 用于按逆序回退订阅扩展与来源配置表。 */
  async down(database): Promise<void> {
    await executeStatements(database, DOWN_STATEMENTS);
  },
};
