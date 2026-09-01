/**
 * @fileoverview 在 PostgreSQL 中验证资讯迁移与订阅创建自动建资讯库。
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
const newsMigrationName = '20260902000000_news_schema';
let database: Kysely<DatabaseSchema>;

/** 用于设置连接级搜索路径且不读取或修改凭据。 */
function createScopedDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set('options', `-csearch_path=${schemaName}`);
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

describe('news schema integration', () => {
  test('迁移 up 创建三张资讯表且 down 逆序删除', async () => {
    await runMigrations(database, migrationOptions('up'));
    const tables = (await database.introspection.getTables()).filter(
      (table) => table.schema === schemaName,
    );
    const names = tables.map((table) => table.name);
    expect(names).toEqual(
      expect.arrayContaining(['news_subscriptions', 'news_seen_items', 'news_digest_runs']),
    );
    const reverted: string[] = [];
    while (!reverted.includes(newsMigrationName) && reverted.length < 10) {
      const step = await runMigrations(database, migrationOptions('down'));
      reverted.push(...step.executedMigrations);
    }
    expect(reverted.at(-1)).toBe(newsMigrationName);
    const remaining = (await database.introspection.getTables()).filter(
      (table) => table.schema === schemaName,
    );
    expect(remaining.filter((table) => table.name.startsWith('news_'))).toHaveLength(0);
    await runMigrations(database, migrationOptions('up'));
  });

  test('创建订阅自动确保资讯知识库且同名复用', async () => {
    const service = createNewsService();
    const subscription = await service.create({
      feedUrl: 'https://example.com/feed.xml',
      name: 'AI 前沿',
      schedule: { kind: 'daily', time: '08:00', timezone: 'Asia/Shanghai' },
    });
    expect(subscription.newsKnowledgeBaseId).toBeTruthy();
    expect(subscription.schedule).toEqual({
      kind: 'daily',
      time: '08:00',
      timezone: 'Asia/Shanghai',
    });
    const second = await service.create({ feedUrl: 'https://example.com/b.xml', name: '第二源' });
    expect(second.newsKnowledgeBaseId).toBe(subscription.newsKnowledgeBaseId);
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
  });
});
