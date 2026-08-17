/** @fileoverview 按显式方向执行有序迁移并报告失败。 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import type {
  Migration,
  MigrationProvider,
  MigrationResult,
  MigratorProps,
} from 'kysely/migration' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from './database.service';
import { identityKnowledgeSchemaMigration } from './migrations/20260812010000_identity_knowledge_schema';
import { localUserSeedMigration } from './migrations/20260812010100_local_user_seed';
import { trashRetentionIndexesMigration } from './migrations/20260817000000_trash_retention_indexes';
import { documentRevisionTitleMigration } from './migrations/20260818000000_document_revision_title';
import { attachmentsMigration } from './migrations/20260819000000_attachments';

const applicationMigrations = {
  '20260812010000_identity_knowledge_schema': identityKnowledgeSchemaMigration,
  '20260812010100_local_user_seed': localUserSeedMigration,
  '20260817000000_trash_retention_indexes': trashRetentionIndexesMigration,
  '20260818000000_document_revision_title': documentRevisionTitleMigration,
  '20260819000000_attachments': attachmentsMigration,
} satisfies Record<string, Migration>;

export type MigrationDirection = 'down' | 'up';

export interface MigrationExecutionOptions {
  direction: MigrationDirection;
  migrationLockTableName?: string;
  migrationTableName?: string;
  migrationTableSchema?: string;
  provider?: MigrationProvider;
}

export interface MigrationExecutionSummary {
  direction: MigrationDirection;
  executedMigrations: readonly string[];
}

/** 用于按稳定名称顺序提供已提交迁移注册表。 */
class ApplicationMigrationProvider implements MigrationProvider {
  /** 用于返回新注册表，避免调用方修改应用定义。 */
  getMigrations(): Promise<Record<string, Migration>> {
    return Promise.resolve({ ...applicationMigrations });
  }
}

/** 用于只收集本次操作成功提交的迁移。 */
function collectSuccessfulMigrations(results: readonly MigrationResult[] | undefined): string[] {
  const executed = [];
  for (const result of results ?? []) {
    if (result.status === 'Success') executed.push(result.migrationName);
  }
  return executed;
}

/** 用于包装未知迁移错误并保留原始原因。 */
function createMigrationError(direction: MigrationDirection, cause: unknown): Error {
  return new Error(`Database migration ${direction} failed`, { cause });
}

/** 用于执行全部待升级迁移或回退一个已应用迁移。 */
export async function runMigrations(
  database: Kysely<DatabaseSchema>,
  options: MigrationExecutionOptions,
): Promise<MigrationExecutionSummary> {
  const { Migrator } = await import('kysely/migration');
  const migratorProps = {
    db: database,
    provider: options.provider ?? new ApplicationMigrationProvider(),
    ...(options.migrationLockTableName === undefined
      ? {}
      : { migrationLockTableName: options.migrationLockTableName }),
    ...(options.migrationTableName === undefined
      ? {}
      : { migrationTableName: options.migrationTableName }),
    ...(options.migrationTableSchema === undefined
      ? {}
      : { migrationTableSchema: options.migrationTableSchema }),
  } satisfies MigratorProps;
  const migrator = new Migrator(migratorProps);
  const result =
    options.direction === 'up' ? await migrator.migrateToLatest() : await migrator.migrateDown();
  if (result.error !== undefined) throw createMigrationError(options.direction, result.error);
  return {
    direction: options.direction,
    executedMigrations: collectSuccessfulMigrations(result.results),
  };
}
