/**
 * @fileoverview 在真实 PostgreSQL 中验证资讯条目登记去重、判定回写、条目流分页与所有权隔离。
 */

import { randomUUID } from 'node:crypto';

import { NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createDatabaseClient } from '../database/database.service';
import type { DatabaseSchema } from '../database/database.types';
import { runMigrations } from '../database/migration-runner';
import { LOCAL_USER_ID } from '../database/migrations/20260812010100_local_user_seed';
import type { CompleteNewsDigestDto } from './complete-news-digest.dto';
import { NewsItemsService } from './news-items.service';
import { NewsRunsService } from './news-runs.service';
import type { RegisteredNewsRunItem } from './register-news-run-items.dto';

const databaseUrl = process.env.DATABASE_URL;
const schemaName = `news_items_test_${process.pid}`;
const otherOwnerId = randomUUID();

let database: Kysely<DatabaseSchema>;
let itemsService: NewsItemsService;
let runsService: NewsRunsService;
let subscriptionId: string;
let otherSubscriptionId: string;
let runId: string;

/** 用于设置连接级搜索路径且不读取或修改凭据。 */
function createScopedDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set('options', `-csearch_path=${schemaName},public`);
  return url.toString();
}

/** 用于构造注入数据库客户端与固定身份的服务依赖。 */
function createDependencies(ownerId: string) {
  return [
    { client: database },
    {
      /** 用于固定测试操作者身份。 */
      getActor: () => ({ ownerId }),
    },
  ] as unknown as ConstructorParameters<typeof NewsItemsService>;
}

/** 用于创建隔离 Schema 并应用最新迁移。 */
async function prepareDatabase(): Promise<void> {
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.createSchema(schemaName).execute();
  await adminDatabase.destroy();
  database = await createDatabaseClient(createScopedDatabaseUrl(databaseUrl!));
  await runMigrations(database, {
    direction: 'up',
    migrationLockTableName: 'migration_lock',
    migrationTableName: 'migration_history',
    migrationTableSchema: schemaName,
  });
  await database
    .insertInto('users')
    .values({ id: otherOwnerId, display_name: '其他用户', timezone: 'UTC' })
    .execute();
  subscriptionId = await createSubscription(LOCAL_USER_ID, 'AI 前沿');
  otherSubscriptionId = await createSubscription(otherOwnerId, '别人的订阅');
  itemsService = new NewsItemsService(...createDependencies(LOCAL_USER_ID));
  runsService = new NewsRunsService(createDependencies(LOCAL_USER_ID)[0]);
}

/** 用于创建一条资讯订阅并返回其 id。 */
async function createSubscription(ownerId: string, name: string): Promise<string> {
  const knowledgeBaseId = randomUUID();
  await database
    .insertInto('knowledge_bases')
    .values({ id: knowledgeBaseId, kind: 'news', name: `${name}-kb`, owner_id: ownerId })
    .execute();
  const id = randomUUID();
  await database
    .insertInto('news_subscriptions')
    .values({
      id,
      name,
      topic: name,
      news_knowledge_base_id: knowledgeBaseId,
      owner_id: ownerId,
    })
    .execute();
  return id;
}

/** 用于创建一条待执行运行。 */
async function createPendingRun(subscription: string): Promise<string> {
  const id = randomUUID();
  await database
    .insertInto('news_digest_runs')
    .values({ id, owner_id: LOCAL_USER_ID, status: 'pending', subscription_id: subscription })
    .execute();
  return id;
}

/** 用于按指纹集合登记条目。 */
function registerItems(
  run: string,
  entries: readonly { fingerprint: string; title: string }[],
): Promise<readonly RegisteredNewsRunItem[]> {
  return runsService.registerRunItems(
    run,
    entries.map((entry) => ({
      contentFingerprint: entry.fingerprint,
      publishedAt: '2026-09-01T00:00:00.000Z',
      snippet: `${entry.title} 摘要`,
      sourceType: 'rss',
      title: entry.title,
      url: `https://example.com/${entry.fingerprint}`,
    })),
  );
}

/** 用于直接插入可控 discovered_at 与重要性的条目行。 */
async function insertItemRow(input: {
  discoveredAt: Date;
  fingerprint: string;
  importance?: string | null;
  ownerId?: string;
  sourceType?: string;
  subscription?: string;
  title: string;
  topic?: string;
}): Promise<void> {
  await database
    .insertInto('news_items')
    .values({
      content_fingerprint: input.fingerprint,
      discovered_at: input.discoveredAt,
      id: randomUUID(),
      importance: input.importance ?? 'normal',
      owner_id: input.ownerId ?? LOCAL_USER_ID,
      source_type: input.sourceType ?? 'rss',
      subscription_id: input.subscription ?? subscriptionId,
      title: input.title,
      topic: input.topic ?? 'AI 前沿',
      url: `https://example.com/${input.fingerprint}`,
    })
    .execute();
}

/** 用于删除测试 Schema 并释放连接池。 */
async function cleanDatabase(): Promise<void> {
  await database.destroy();
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.dropSchema(schemaName).cascade().execute();
  await adminDatabase.destroy();
}

beforeAll(prepareDatabase);
afterAll(cleanDatabase);

/** 用于断言登记按指纹去重并快照主题、运行与所有者。 */
async function expectRegistrationDedup(): Promise<void> {
  runId = await createPendingRun(subscriptionId);
  await runsService.claimPendingDigestRuns(5);
  const entries = [
    { fingerprint: 'a'.repeat(64), title: '第一条' },
    { fingerprint: 'b'.repeat(64), title: '第二条' },
  ];
  expect(await registerItems(runId, entries)).toHaveLength(2);
  const second = await registerItems(runId, [
    ...entries,
    { fingerprint: 'c'.repeat(64), title: '第三条' },
  ]);
  expect(second).toHaveLength(3);
  const rows = await database
    .selectFrom('news_items')
    .selectAll()
    .where('subscription_id', '=', subscriptionId)
    .execute();
  expect(rows).toHaveLength(3);
  expect(rows.every((row) => row.topic === 'AI 前沿')).toBe(true);
  expect(rows.every((row) => row.discovered_run_id === runId)).toBe(true);
  expect(rows.every((row) => row.importance === 'normal')).toBe(true);
  expect(rows.every((row) => row.owner_id === LOCAL_USER_ID)).toBe(true);
}

/** 用于断言完结回写重要性、相关性拒绝并忽略未知条目。 */
async function expectCompleteWritesItemResults(): Promise<void> {
  const stored = await database
    .selectFrom('news_items')
    .select(['id', 'content_fingerprint'])
    .where('subscription_id', '=', subscriptionId)
    .execute();
  const highRow = stored.find((row) => row.content_fingerprint === 'a'.repeat(64))!;
  const rejectedRow = stored.find((row) => row.content_fingerprint === 'b'.repeat(64))!;
  const input: CompleteNewsDigestDto = {
    itemImportance: [
      { importance: 'high', itemId: highRow.id },
      { importance: 'low', itemId: randomUUID() },
    ],
    rejectedItemIds: [rejectedRow.id],
    status: 'succeeded',
  };
  await runsService.completeDigestRun(runId, input);
  const rows = await database
    .selectFrom('news_items')
    .select(['id', 'importance', 'relevance'])
    .where('subscription_id', '=', subscriptionId)
    .execute();
  expect(rows.find((row) => row.id === highRow.id)!).toMatchObject({
    importance: 'high',
    relevance: 'accepted',
  });
  expect(rows.find((row) => row.id === rejectedRow.id)!).toMatchObject({
    importance: null,
    relevance: 'rejected',
  });
}

/** 用于断言被拒条目不出现在条目流。 */
async function expectRejectedItemsHidden(): Promise<void> {
  const page = await itemsService.list({});
  expect(page.items.some((item) => item.title === '第二条')).toBe(false);
}

/** 用于断言终态运行拒绝继续登记条目。 */
async function expectTerminalRunRejectsRegistration(): Promise<void> {
  await expect(
    registerItems(runId, [{ fingerprint: 'd'.repeat(64), title: '迟到' }]),
  ).rejects.toThrow(/终态/u);
}

/** 用于断言条目流按重要性、发现时间倒序 keyset 分页且游标收敛。 */
async function expectKeysetPagination(): Promise<void> {
  const base = Date.UTC(2027, 0, 1, 0, 0, 0);
  for (let index = 0; index < 5; index += 1) {
    await insertItemRow({
      discoveredAt: new Date(base + index * 1000),
      fingerprint: `p${index}`.padEnd(64, '0'),
      title: `分页条目 ${index}`,
    });
  }
  // 之前用例留下的「第一条」为 high，按重要性降序排在所有 normal 之前。
  const firstPage = await itemsService.list({ limit: 2 });
  expect(firstPage.items.map((item) => item.title)).toEqual(['第一条', '分页条目 4']);
  expect(firstPage.nextCursor).not.toBeNull();
  const secondPage = await itemsService.list({ cursor: firstPage.nextCursor!, limit: 2 });
  expect(secondPage.items.map((item) => item.title)).toEqual(['分页条目 3', '分页条目 2']);
  const thirdPage = await itemsService.list({ cursor: secondPage.nextCursor! });
  expect(thirdPage.items[0]!.title).toBe('分页条目 1');
  expect(thirdPage.items).toHaveLength(3);
  expect(thirdPage.nextCursor).toBeNull();
}

/** 用于断言重要性降序优先且来源与订阅过滤可组合。 */
async function expectFilterCombinations(): Promise<void> {
  const base = Date.UTC(2027, 0, 2, 0, 0, 0);
  await insertItemRow({
    discoveredAt: new Date(base),
    fingerprint: 'f1'.padEnd(64, '0'),
    importance: 'high',
    title: '过滤高重要性',
  });
  await insertItemRow({
    discoveredAt: new Date(base + 60_000),
    fingerprint: 'f2'.padEnd(64, '0'),
    sourceType: 'search',
    title: '过滤搜索来源',
  });
  const high = await itemsService.list({ importance: 'high' });
  expect(high.items.map((item) => item.title).slice(0, 2)).toEqual(['过滤高重要性', '第一条']);
  const search = await itemsService.list({ sourceType: 'search' });
  expect(search.items.map((item) => item.title)).toEqual(['过滤搜索来源']);
  const all = await itemsService.list({});
  expect(all.items[0]!.title).toBe('过滤高重要性');
  const foreign = await itemsService.list({ subscriptionId: otherSubscriptionId });
  expect(foreign.items).toHaveLength(0);
  const own = await itemsService.list({ subscriptionId });
  expect(own.items.some((item) => item.title === '过滤高重要性')).toBe(true);
}

/** 用于断言跨过滤游标被拒绝。 */
async function expectCursorFingerprintGuard(): Promise<void> {
  const page = await itemsService.list({ limit: 1 });
  await expect(itemsService.list({ cursor: page.nextCursor!, importance: 'high' })).rejects.toThrow(
    /不匹配/u,
  );
}

/** 用于断言详情携带处理正文与运行引用且跨所有者不可见。 */
async function expectDetailOwnership(): Promise<void> {
  const ownRun = await createPendingRun(subscriptionId);
  const [registered] = await registerItems(ownRun, [
    { fingerprint: 'e'.repeat(64), title: '详情条目' },
  ]);
  const detail = await itemsService.get(registered!.id);
  expect(detail.discoveredRunId).toBe(ownRun);
  expect(detail.relevance).toBe('accepted');
  expect(detail.colorSlot).toBe(1);
  const otherItem = randomUUID();
  await database
    .insertInto('news_items')
    .values({
      content_fingerprint: 'x'.repeat(64),
      discovered_at: new Date(),
      id: otherItem,
      importance: 'normal',
      owner_id: otherOwnerId,
      source_type: 'rss',
      subscription_id: otherSubscriptionId,
      title: '别人的条目',
      topic: '别人的订阅',
      url: 'https://example.com/x',
    })
    .execute();
  await expect(itemsService.get(otherItem)).rejects.toThrow(NotFoundException);
}

describe('news items integration', () => {
  test('登记条目按指纹去重并快照主题与运行引用', expectRegistrationDedup);
  test('完结回写条目重要性与相关性判定且忽略未知条目', expectCompleteWritesItemResults);
  test('被拒条目不出现在条目流', expectRejectedItemsHidden);
  test('终态运行拒绝继续登记条目', expectTerminalRunRejectsRegistration);
  test('条目流按重要性、发现时间倒序 keyset 分页且 nextCursor 收敛', expectKeysetPagination);
  test('条目流支持重要性、来源与订阅的组合过滤', expectFilterCombinations);
  test('跨过滤条件游标被拒绝', expectCursorFingerprintGuard);
  test('详情返回处理正文与运行引用且跨所有者不可见', expectDetailOwnership);
});
