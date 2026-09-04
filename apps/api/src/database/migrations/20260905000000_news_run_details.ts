/**
 * @fileoverview 为简报运行补充来源决策明细与结构化警告列。
 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import type { Migration } from 'kysely/migration' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database.types';

const UP_STATEMENTS = [
  `ALTER TABLE news_digest_runs
    ADD COLUMN source_results jsonb NOT NULL DEFAULT '[]'
    CONSTRAINT news_digest_runs_source_results_valid
      CHECK (jsonb_typeof(source_results) = 'array')`,
  `ALTER TABLE news_digest_runs
    ADD COLUMN warnings jsonb NOT NULL DEFAULT '[]'
    CONSTRAINT news_digest_runs_warnings_valid
      CHECK (jsonb_typeof(warnings) = 'array')`,
] as const;

const DOWN_STATEMENTS = [
  'ALTER TABLE news_digest_runs DROP COLUMN warnings',
  'ALTER TABLE news_digest_runs DROP COLUMN source_results',
] as const;

/** 用于在 Kysely Migrator 事务中按声明顺序执行静态 DDL。 */
async function executeStatements(
  database: Kysely<DatabaseSchema>,
  statements: readonly string[],
): Promise<void> {
  const { sql } = await import('kysely');
  for (const statement of statements) await sql.raw(statement).execute(database);
}

export const newsRunDetailsMigration: Migration = {
  /** 用于为简报运行追加来源决策与警告列。 */
  async up(database): Promise<void> {
    await executeStatements(database, UP_STATEMENTS);
  },
  /** 用于按逆序删除本迁移新增的列。 */
  async down(database): Promise<void> {
    await executeStatements(database, DOWN_STATEMENTS);
  },
};
