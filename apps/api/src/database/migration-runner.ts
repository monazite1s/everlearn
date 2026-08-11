/** @fileoverview Executes ordered application migrations with explicit direction and failure reporting. */

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

const applicationMigrations = {
  '20260812010000_identity_knowledge_schema': identityKnowledgeSchemaMigration,
  '20260812010100_local_user_seed': localUserSeedMigration,
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

/** Supplies the checked-in migration registry in deterministic name order. */
class ApplicationMigrationProvider implements MigrationProvider {
  /** Returns a fresh registry so callers cannot mutate the application definition. */
  getMigrations(): Promise<Record<string, Migration>> {
    return Promise.resolve({ ...applicationMigrations });
  }
}

/** Collects only migrations committed successfully by the completed operation. */
function collectSuccessfulMigrations(results: readonly MigrationResult[] | undefined): string[] {
  const executed = [];
  for (const result of results ?? []) {
    if (result.status === 'Success') executed.push(result.migrationName);
  }
  return executed;
}

/** Wraps an unknown migration failure without discarding its original cause. */
function createMigrationError(direction: MigrationDirection, cause: unknown): Error {
  return new Error(`Database migration ${direction} failed`, { cause });
}

/** Runs all pending migrations up or exactly one applied migration down. */
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
