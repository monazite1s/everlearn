/**
 * @fileoverview 创建教程对话会话与对话消息两张 compose 状态表。
 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import type { Migration } from 'kysely/migration' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database.types';

const UP_STATEMENTS = [
  `CREATE TABLE tutorial_conversations (
    id uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES tutorial_sessions (id) ON DELETE CASCADE,
    title text NOT NULL CONSTRAINT tutorial_conversations_title_present CHECK (length(btrim(title)) BETWEEN 1 AND 200),
    status text NOT NULL CONSTRAINT tutorial_conversations_status_valid CHECK (status IN ('active', 'archived')),
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    updated_at timestamptz NOT NULL DEFAULT transaction_timestamp()
  )`,
  `CREATE INDEX tutorial_conversations_session_idx ON tutorial_conversations (session_id, created_at DESC, id) WHERE status = 'active'`,
  `CREATE UNIQUE INDEX tutorial_conversations_active_uidx ON tutorial_conversations (session_id) WHERE status = 'active'`,
  `CREATE TABLE tutorial_messages (
    id uuid PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES tutorial_conversations (id) ON DELETE CASCADE,
    role text NOT NULL CONSTRAINT tutorial_messages_role_valid CHECK (role IN ('user', 'agent', 'system')),
    content text NOT NULL CONSTRAINT tutorial_messages_content_present CHECK (length(btrim(content)) BETWEEN 1 AND 20000),
    proposal jsonb CONSTRAINT tutorial_messages_proposal_valid CHECK (proposal IS NULL OR jsonb_typeof(proposal) = 'object'),
    proposal_status text CONSTRAINT tutorial_messages_proposal_status_valid
      CHECK (proposal_status IN ('pending', 'accepted', 'rejected', 'superseded')),
    created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
    CONSTRAINT tutorial_messages_proposal_status_paired CHECK (
      (proposal IS NULL) = (proposal_status IS NULL)
    )
  )`,
  `CREATE INDEX tutorial_messages_conversation_idx ON tutorial_messages (conversation_id, created_at, id)`,
] as const;

const DOWN_STATEMENTS = [
  'DROP TABLE tutorial_messages',
  'DROP TABLE tutorial_conversations',
] as const;

/** 用于在 Kysely Migrator 事务中按声明顺序执行静态 DDL。 */
async function executeStatements(
  database: Kysely<DatabaseSchema>,
  statements: readonly string[],
): Promise<void> {
  const { sql } = await import('kysely');
  for (const statement of statements) await sql.raw(statement).execute(database);
}

export const tutorialComposeMigration: Migration = {
  /** 用于原子创建对话会话与消息表、约束及已知查询索引。 */
  async up(database): Promise<void> {
    await executeStatements(database, UP_STATEMENTS);
  },
  /** 用于按外键逆序删除本迁移创建的关系。 */
  async down(database): Promise<void> {
    await executeStatements(database, DOWN_STATEMENTS);
  },
};
