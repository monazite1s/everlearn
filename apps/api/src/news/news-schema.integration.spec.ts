/**
 * @fileoverview 在 PostgreSQL 中验证资讯迁移、订阅创建自动建库与多来源配置。
 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createDatabaseClient } from '../database/database.service';
import type { DatabaseSchema } from '../database/database.types';
import { runMigrations } from '../database/migration-runner';
import { LOCAL_USER_ID } from '../database/migrations/20260812010100_local_user_seed';
import { NewsService } from './news.service';

const databaseUrl = process.env.DATABASE_URL;
const schemaName = `news_schema_test_${process.pid}`;
const newsSourcesMigrationName = '20260909000000_news_subscription_sources';
let database: Kysely<DatabaseSchema>;

/** 用于设置连接级搜索路径且不读取或修改凭据。 */
function createScopedDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set('options', `-csearch_path=${schemaName},public`);
  return url.toString();
}

/** 用于创建隔离 Schema 及限定 DDL 作用域的客户端。 */
async function prepareDatabase(): Promise<void> {
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.createSchema(schemaName).execute();
  await adminDatabase.destroy();
  database = await createDatabaseClient(createScopedDatabaseUrl(databaseUrl!));
}

/** 用于删除测试 Schema 并释放连接池。 */
async function cleanDatabase(): Promise<void> {
  await database.destroy();
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.dropSchema(schemaName).cascade().execute();
  await adminDatabase.destroy();
}

/** 用于在隔离 Schema 中创建确定的 Kysely 元数据名称。 */
function migrationOptions(direction: 'down' | 'up') {
  return {
    direction,
    migrationLockTableName: 'migration_lock',
    migrationTableName: 'migration_history',
    migrationTableSchema: schemaName,
  } as const;
}

/** 用于构造注入本地身份的资讯服务。 */
function createNewsService(): NewsService {
  const dependencies = [
    { client: database },
    {
      /** 用于固定本地操作者身份。 */
      getActor: () => ({ ownerId: LOCAL_USER_ID }),
    },
  ] as unknown as ConstructorParameters<typeof NewsService>;
  return new NewsService(dependencies[0], dependencies[1]);
}

beforeAll(prepareDatabase);
afterAll(cleanDatabase);

/** 用于循环 down 至目标迁移并返回实际回退的迁移名序列。 */
async function revertUntil(target: string): Promise<string[]> {
  const reverted: string[] = [];
  while (!reverted.includes(target) && reverted.length < 15) {
    const step = await runMigrations(database, migrationOptions('down'));
    reverted.push(...step.executedMigrations);
  }
  return reverted;
}

/** 用于断言隔离 Schema 中以 news_ 开头的表集合。 */
async function expectNewsTables(expected: readonly string[]): Promise<void> {
  const tables = (await database.introspection.getTables()).filter(
    (table) => table.schema === schemaName,
  );
  expect(tables.map((table) => table.name)).toEqual(expect.arrayContaining([...expected]));
}

/** 用于断言迁移 up 建表且可逆序回退到来源扩展迁移。 */
async function expectMigrationsCreateAndRevertNewsTables(): Promise<void> {
  await runMigrations(database, migrationOptions('up'));
  await expectNewsTables([
    'news_subscriptions',
    'news_seen_items',
    'news_digest_runs',
    'news_items',
    'news_sources',
  ]);
  const reverted = await revertUntil(newsSourcesMigrationName);
  expect(reverted.at(-1)).toBe(newsSourcesMigrationName);
  const tables = await database.introspection.getTables();
  const subscriptions = tables.find(
    (table) => table.schema === schemaName && table.name === 'news_subscriptions',
  );
  expect(subscriptions?.columns.map((column) => column.name)).not.toContain('topic');
  await runMigrations(database, migrationOptions('up'));
}

/** 用于断言创建订阅自动确保资讯库、分配色槽并写入多来源。 */
async function expectCreateAssignsSlotAndSources(): Promise<void> {
  const service = createNewsService();
  const subscription = await service.create({
    name: 'AI 前沿',
    schedule: { kind: 'daily', time: '08:00', timezone: 'Asia/Shanghai' },
    sources: [{ type: 'rss', value: 'https://example.com/feed.xml' }],
    topic: '人工智能前沿动态',
  });
  expect(subscription.newsKnowledgeBaseId).toBeTruthy();
  expect(subscription.schedule).toEqual({
    kind: 'daily',
    time: '08:00',
    timezone: 'Asia/Shanghai',
    weekday: null,
  });
  expect(subscription.sources).toEqual([{ type: 'rss', value: 'https://example.com/feed.xml' }]);
  expect(subscription.colorSlot).toBeGreaterThanOrEqual(1);
  expect(subscription.colorSlot).toBeLessThanOrEqual(5);
  expect(subscription.version).toBe(1);
  const second = await service.create({
    name: '第二源',
    sources: [{ type: 'rss', value: 'https://example.com/b.xml' }],
    topic: '第二个主题',
  });
  expect(second.newsKnowledgeBaseId).toBe(subscription.newsKnowledgeBaseId);
  expect(second.colorSlot).not.toBe(subscription.colorSlot);
  const knowledgeBases = await database
    .selectFrom('knowledge_bases')
    .select('id')
    .where('owner_id', '=', LOCAL_USER_ID)
    .where('name', '=', '资讯')
    .execute();
  expect(knowledgeBases).toHaveLength(1);
  const runs = await service.createRun(subscription.id);
  expect(runs.status).toBe('pending');
  expect(await service.list()).toHaveLength(2);
}

/** 用于断言更新订阅校验版本冲突并整体替换来源。 */
async function expectUpdateGuardsVersionAndReplacesSources(): Promise<void> {
  const service = createNewsService();
  const created = await service.create({
    name: '版本守卫',
    sources: [{ type: 'rss', value: 'https://example.com/v.xml' }],
    topic: '版本主题',
  });
  await expect(
    service.update(created.id, {
      name: '版本守卫',
      sources: [{ type: 'rss', value: 'https://example.com/v2.xml' }],
      topic: '版本主题',
      version: 99,
    }),
  ).rejects.toThrow(/已被其他保存更新/u);
  const updated = await service.update(created.id, {
    name: '版本守卫（改）',
    schedule: { kind: 'weekly', time: '09:30', timezone: 'UTC', weekday: 3 },
    sources: [{ type: 'site', value: 'https://example.com/site' }],
    topic: '版本主题（改）',
    version: 1,
  });
  expect(updated.version).toBe(2);
  expect(updated.sources).toEqual([{ type: 'site', value: 'https://example.com/site' }]);
  expect(updated.schedule).toEqual({
    kind: 'weekly',
    time: '09:30',
    timezone: 'UTC',
    weekday: 3,
  });
  const sourceRows = await database
    .selectFrom('news_sources')
    .select(['type', 'value'])
    .where('subscription_id', '=', created.id)
    .execute();
  expect(sourceRows).toEqual([{ type: 'site', value: 'https://example.com/site' }]);
}

describe('news schema integration', () => {
  test('迁移 up 创建五张资讯表且 down 逆序删除', expectMigrationsCreateAndRevertNewsTables);
  test('创建订阅自动确保资讯库、分配色槽并写入多来源', expectCreateAssignsSlotAndSources);
  test('更新订阅校验版本冲突并整体替换来源', expectUpdateGuardsVersionAndReplacesSources);
});
