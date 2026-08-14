/** @fileoverview 在隔离 PostgreSQL Schema 中验证 Kysely 迁移可回退。 */

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
  /** 用于创建仅验证迁移执行的临时关系。 */
  async up(target): Promise<void> {
    await target.schema
      .withSchema(schemaName)
      .createTable('probe')
      .addColumn('id', 'integer')
      .execute();
  },
  /** 用于删除临时关系以验证回退行为。 */
  async down(target): Promise<void> {
    await target.schema.withSchema(schemaName).dropTable('probe').execute();
  },
};

/** 用于提供不修改生产注册表的确定测试迁移。 */
class ProbeMigrationProvider implements MigrationProvider {
  /** 用于为每个迁移器返回独立测试注册表。 */
  getMigrations(): Promise<Record<string, Migration>> {
    return Promise.resolve({ [migrationName]: probeMigration });
  }
}

/** 用于复用 PostgreSQL 服务并创建隔离 Schema。 */
async function prepareDatabase(): Promise<void> {
  database = await createDatabaseClient(databaseUrl!);
  await database.schema.createSchema(schemaName).execute();
}

/** 用于删除测试迁移产物并释放连接池。 */
async function cleanDatabase(): Promise<void> {
  await database.schema.dropSchema(schemaName).cascade().execute();
  await database.destroy();
}

/** 用于判断临时关系是否存在。 */
async function probeExists(): Promise<boolean> {
  const tables = await database.introspection.getTables({ withInternalKyselyTables: true });
  for (const table of tables) {
    if (table.schema === schemaName && table.name === 'probe') return true;
  }
  return false;
}

/** 用于为指定方向创建隔离迁移选项。 */
function createOptions(direction: 'down' | 'up') {
  return {
    direction,
    migrationLockTableName: 'migration_lock',
    migrationTableName: 'migration_history',
    migrationTableSchema: schemaName,
    provider: new ProbeMigrationProvider(),
  } as const;
}

/** 用于验证升级、重复升级、回退和再次升级保持确定。 */
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

/** 用于按数据库配置注册隔离迁移场景。 */
function defineMigrationTests(): void {
  beforeAll(prepareDatabase);
  afterAll(cleanDatabase);
  test('runs up, repeated up, down, and up again', migratesReversibly);
}

describe.skipIf(databaseUrl === undefined)('database migration runner', defineMigrationTests);
