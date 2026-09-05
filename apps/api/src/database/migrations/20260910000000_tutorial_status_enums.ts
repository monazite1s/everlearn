/**
 * @fileoverview 收敛教程会话与章节状态枚举 CHECK 与领取索引，兼容新旧两种库状态。
 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import type { Migration } from 'kysely/migration' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database.types';

const UP_STATEMENTS = [
  `DO $$
  DECLARE legacy text;
  BEGIN
    FOR legacy IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'tutorial_sessions'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%outline_ready%'
    LOOP
      EXECUTE format('ALTER TABLE tutorial_sessions DROP CONSTRAINT %I', legacy);
    END LOOP;
  END
  $$`,
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'tutorial_sessions'::regclass
        AND conname = 'tutorial_sessions_status_valid'
    ) THEN
      ALTER TABLE tutorial_sessions ADD CONSTRAINT tutorial_sessions_status_valid
        CHECK (status IN ('draft_scope', 'researching', 'awaiting_outline', 'generating', 'partial', 'completed', 'failed', 'cancelled'));
    END IF;
  END
  $$`,
  `DO $$
  DECLARE legacy text;
  BEGIN
    FOR legacy IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'tutorial_chapters'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%succeeded%'
    LOOP
      EXECUTE format('ALTER TABLE tutorial_chapters DROP CONSTRAINT %I', legacy);
    END LOOP;
  END
  $$`,
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'tutorial_chapters'::regclass
        AND conname = 'tutorial_chapters_status_valid'
    ) THEN
      ALTER TABLE tutorial_chapters ADD CONSTRAINT tutorial_chapters_status_valid
        CHECK (status IN ('placeholder', 'queued', 'running', 'completed', 'warning', 'failed', 'cancelled'));
    END IF;
  END
  $$`,
  // rename 无法更新部分索引谓词，改用删除重建以对齐新查询形态。
  `DROP INDEX IF EXISTS tutorial_chapters_pending_idx`,
  `CREATE INDEX IF NOT EXISTS tutorial_chapters_claimable_idx ON tutorial_chapters (session_id, created_at, id) WHERE status IN ('placeholder', 'queued')`,
] as const;

const DOWN_STATEMENTS = [
  `DO $$
  DECLARE current text;
  BEGIN
    FOR current IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'tutorial_sessions'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%draft_scope%'
    LOOP
      EXECUTE format('ALTER TABLE tutorial_sessions DROP CONSTRAINT %I', current);
    END LOOP;
  END
  $$`,
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'tutorial_sessions'::regclass
        AND conname = 'tutorial_sessions_status_valid'
    ) THEN
      ALTER TABLE tutorial_sessions ADD CONSTRAINT tutorial_sessions_status_valid
        CHECK (status IN ('draft', 'researching', 'outline_ready', 'generating', 'partial', 'completed', 'failed', 'canceled'));
    END IF;
  END
  $$`,
  `DO $$
  DECLARE current text;
  BEGIN
    FOR current IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'tutorial_chapters'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%placeholder%'
    LOOP
      EXECUTE format('ALTER TABLE tutorial_chapters DROP CONSTRAINT %I', current);
    END LOOP;
  END
  $$`,
  `DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'tutorial_chapters'::regclass
        AND conname = 'tutorial_chapters_status_valid'
    ) THEN
      ALTER TABLE tutorial_chapters ADD CONSTRAINT tutorial_chapters_status_valid
        CHECK (status IN ('pending', 'generating', 'succeeded', 'failed', 'canceled'));
    END IF;
  END
  $$`,
  `DROP INDEX IF EXISTS tutorial_chapters_claimable_idx`,
  `CREATE INDEX IF NOT EXISTS tutorial_chapters_pending_idx ON tutorial_chapters (session_id, created_at, id) WHERE status = 'pending'`,
] as const;

/** 用于在 Kysely Migrator 事务中按声明顺序执行幂等 DDL。 */
async function executeStatements(
  database: Kysely<DatabaseSchema>,
  statements: readonly string[],
): Promise<void> {
  const { sql } = await import('kysely');
  for (const statement of statements) await sql.raw(statement).execute(database);
}

export const tutorialStatusEnumsMigration: Migration = {
  /** 用于把教程状态约束收敛到新枚举，对已收敛库保持 no-op。 */
  async up(database): Promise<void> {
    await executeStatements(database, UP_STATEMENTS);
  },
  /** 用于把教程状态约束回退到旧枚举与旧领取索引。 */
  async down(database): Promise<void> {
    await executeStatements(database, DOWN_STATEMENTS);
  },
};
