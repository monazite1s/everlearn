/** @fileoverview Verifies reversible Kysely migrations against an isolated PostgreSQL schema. */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import type { Migration, MigrationProvider } from 'kysely/migration' with {
  'resolution-mode': 'import',
};
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createDatabaseClient, type DatabaseSchema } from './database.service';
import { runMigrations } from './migration-runner';

const databaseUrl = process.env.DATABASE_URL;
const schemaName = `migration_test_${process.pid}`;
const migrationName = '00000000000000_test_probe';
let database: Kysely<DatabaseSchema>;

const probeMigration: Migration = {
  /** Creates a disposable relation used only to verify migration execution. */
  async up(target): Promise<void> {
    await target.schema
      .withSchema(schemaName)
      .createTable('probe')
      .addColumn('id', 'integer')
      .execute();
  },
  /** Removes the disposable relation so down migration behavior is observable. */
  async down(target): Promise<void> {
    await target.schema.withSchema(schemaName).dropTable('probe').execute();
  },
};

/** Supplies one deterministic test migration without touching the production registry. */
class ProbeMigrationProvider implements MigrationProvider {
  /** Returns a fresh test registry for every migrator instance. */
  getMigrations(): Promise<Record<string, Migration>> {
    return Promise.resolve({ [migrationName]: probeMigration });
  }
}

/** Creates an isolated schema while reusing the configured PostgreSQL service. */
async function prepareDatabase(): Promise<void> {
  database = await createDatabaseClient(databaseUrl!);
  await database.schema.createSchema(schemaName).execute();
}

/** Drops all test migration artifacts and releases the connection pool. */
async function cleanDatabase(): Promise<void> {
  await database.schema.dropSchema(schemaName).cascade().execute();
  await database.destroy();
}

/** Returns whether the disposable relation currently exists. */
async function probeExists(): Promise<boolean> {
  const tables = await database.introspection.getTables({ withInternalKyselyTables: true });
  for (const table of tables) {
    if (table.schema === schemaName && table.name === 'probe') return true;
  }
  return false;
}

/** Creates isolated migration options for one requested direction. */
function createOptions(direction: 'down' | 'up') {
  return {
    direction,
    migrationLockTableName: 'migration_lock',
    migrationTableName: 'migration_history',
    migrationTableSchema: schemaName,
    provider: new ProbeMigrationProvider(),
  } as const;
}

/** Verifies up, repeated up, down, and re-applied up remain deterministic. */
async function migratesReversibly(): Promise<void> {
  const firstUp = await runMigrations(database, createOptions('up'));
  expect(firstUp.executedMigrations).toEqual([migrationName]);
  expect(await probeExists()).toBe(true);

  const repeatedUp = await runMigrations(database, createOptions('up'));
  expect(repeatedUp.executedMigrations).toEqual([]);

  const down = await runMigrations(database, createOptions('down'));
  expect(down.executedMigrations).toEqual([migrationName]);
  expect(await probeExists()).toBe(false);

  const reappliedUp = await runMigrations(database, createOptions('up'));
  expect(reappliedUp.executedMigrations).toEqual([migrationName]);
  expect(await probeExists()).toBe(true);
}

/** Registers the isolated PostgreSQL migration scenario. */
function defineMigrationTests(): void {
  beforeAll(prepareDatabase);
  afterAll(cleanDatabase);
  test('runs up, repeated up, down, and up again', migratesReversibly);
}

describe.skipIf(databaseUrl === undefined)('database migration runner', defineMigrationTests);
