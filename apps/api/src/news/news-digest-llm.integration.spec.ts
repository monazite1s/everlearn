/**
 * @fileoverview 用真实 GLM 模型执行资讯简报全流程，验证相关性与重要性的真实判定链路，未配置模型时跳过。
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createDatabaseClient } from '../database/database.service';
import type { DatabaseSchema } from '../database/database.types';
import { runMigrations } from '../database/migration-runner';
import { NewsRunsService } from './news-runs.service';
import { NewsService } from './news.service';
import { executeNewsDigest } from '../../../worker/src/news/news-digest.executor';
import type { NewsDigestExecutorConfig } from '../../../worker/src/news/news-digest.executor';

const databaseUrl = process.env.DATABASE_URL;
const schemaName = `news_llm_${process.pid}`;
const internalSecret = 'news-llm-secret';
const llmReady = Boolean(
  process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL,
);
const subscriptionName = '大模型与知识管理追踪';

const rssXml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<rss version="2.0"><channel><title>测试源</title>',
  '<item><title>大模型检索增强生成的新进展</title>',
  '<link>https://example.com/rag?utm_source=x</link>',
  '<pubDate>Mon, 31 Aug 2026 01:00:00 GMT</pubDate>',
  '<description>综述检索增强生成在知识库问答中的工程实践与评测方法。</description></item>',
  '<item><title>个人知识管理工具的标签体系设计</title>',
  '<link>https://example.com/pkm</link>',
  '<pubDate>Tue, 01 Sep 2026 01:00:00 GMT</pubDate>',
  '<description>讨论笔记软件如何用标签与双向链接组织长期知识沉淀。</description></item>',
  '<item><title>本周足球联赛战报</title>',
  '<link>https://example.com/football</link>',
  '<pubDate>Wed, 02 Sep 2026 01:00:00 GMT</pubDate>',
  '<description>回顾周末联赛的进球与积分榜变化。</description></item>',
  '<item><title>家常菜谱：红烧肉的做法</title>',
  '<link>https://example.com/recipe</link>',
  '<pubDate>Thu, 03 Sep 2026 01:00:00 GMT</pubDate>',
  '<description>介绍红烧肉的家常步骤与火候技巧。</description></item>',
  '</channel></rss>',
].join('');

let application: INestApplication | undefined;
let appBaseUrl = '';
let database: Kysely<DatabaseSchema> | undefined;
let rssServer: Server | undefined;
let rssUrl = '';
let newsService: NewsService;
let runsService: NewsRunsService;

/** 用于设置连接级搜索路径且不读取或修改凭据。 */
function createScopedDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set('options', `-csearch_path=${schemaName},public`);
  return url.toString();
}

/** 用于在导入 AppModule 前提供除模型外的测试基础设施配置，模型走真实环境。 */
function applyFixtureEnvironment(scopedDatabaseUrl: string): void {
  process.env.DATABASE_URL = scopedDatabaseUrl;
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  process.env.S3_ACCESS_KEY = 'integration-test-access';
  process.env.S3_BUCKET = 'integration-test';
  process.env.S3_ENDPOINT = 'http://127.0.0.1:8333';
  process.env.S3_FORCE_PATH_STYLE = 'true';
  process.env.S3_REGION = 'local';
  process.env.S3_SECRET_KEY = 'integration-test-secret';
  process.env.PURGE_TRIGGER_SECRET = internalSecret;
}

/** 用于启动固定 RSS 响应的测试源服务器。 */
async function startRssServer(): Promise<void> {
  rssServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/xml' });
    response.end(rssXml);
  });
  await new Promise<void>((resolve) => rssServer!.listen(0, '127.0.0.1', resolve));
  const address = rssServer.address() as AddressInfo;
  rssUrl = `http://127.0.0.1:${address.port}/feed.xml`;
}

/** 用于创建隔离 Schema、迁移最新结构并启动生产 Nest 应用。 */
async function prepareApplication(): Promise<void> {
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.createSchema(schemaName).execute();
  await adminDatabase.destroy();
  const scopedDatabaseUrl = createScopedDatabaseUrl(databaseUrl!);
  database = await createDatabaseClient(scopedDatabaseUrl);
  await runMigrations(database, {
    direction: 'up',
    migrationLockTableName: 'migration_lock',
    migrationTableName: 'migration_history',
    migrationTableSchema: schemaName,
  });
  await startRssServer();
  applyFixtureEnvironment(scopedDatabaseUrl);
  const { AppModule } = await import('../app.module');
  application = await NestFactory.create(AppModule, { logger: false });
  application.setGlobalPrefix('api/v1');
  await application.listen(0);
  appBaseUrl = (await application.getUrl()).replace('[::1]', '127.0.0.1').replace(/\/$/, '');
  newsService = application.get(NewsService);
  runsService = application.get(NewsRunsService);
}

/** 用于关闭应用、测试服务器与隔离 Schema。 */
async function cleanApplication(): Promise<void> {
  await application?.close();
  await new Promise<void>((resolve) => rssServer!.close(() => resolve()));
  await database?.destroy();
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.dropSchema(schemaName).cascade().execute();
  await adminDatabase.destroy();
}

/** 用于构造指向测试内 Nest 应用的执行器配置，测试源绑定环回须跳过私网校验。 */
function createExecutorConfig(): NewsDigestExecutorConfig {
  return { allowPrivateFeedUrls: true, apiInternalUrl: appBaseUrl, secret: internalSecret };
}

/** 用于执行一次端到端简报并返回运行详情。 */
async function runOnce(subscriptionId: string): Promise<string> {
  await newsService.createRun(subscriptionId);
  const [claimed] = await runsService.claimPendingDigestRuns(5);
  if (claimed === undefined) throw new Error('领取待执行运行失败');
  await executeNewsDigest(claimed, createExecutorConfig());
  const run = await database!
    .selectFrom('news_digest_runs')
    .select(['brief_document_id', 'error_code', 'status'])
    .where('id', '=', claimed.runId)
    .executeTakeFirstOrThrow();
  expect(run.status, `errorCode=${run.error_code}`).toBe('succeeded');
  return claimed.runId;
}

/** 用于读取指定订阅的全部条目行。 */
function readItems(subscriptionId: string) {
  return database!
    .selectFrom('news_items')
    .selectAll()
    .where('subscription_id', '=', subscriptionId)
    .execute();
}

/** 用于断言简报修订标题为「订阅名·资讯简报 当日日期」。 */
function expectBriefTitle(title: string): void {
  expect(title).toBe(`${subscriptionName}·资讯简报 ${new Date().toISOString().slice(0, 10)}`);
}

beforeAll(prepareApplication);
afterAll(cleanApplication);

/** 用于执行真实模型全流程断言：登记、筛选、重要性、简报与去重。 */
async function expectRealModelDigestFlow(): Promise<void> {
  const subscription = await newsService.create({
    name: subscriptionName,
    sources: [{ type: 'rss', value: rssUrl }],
    topic: subscriptionName,
  });
  const firstRunId = await runOnce(subscription.id);
  const items = await readItems(subscription.id);
  expect(items).toHaveLength(4);
  expect(items.every((row) => row.discovered_run_id === firstRunId)).toBe(true);
  expect(items.every((row) => row.topic === subscriptionName)).toBe(true);
  const run = await newsService.getRun(firstRunId);
  expect(run.sourceResults).toHaveLength(4);
  expect(new Set(run.sourceResults.map((entry) => entry.title)).size).toBe(4);
  const detail = await database!
    .selectFrom('news_digest_runs')
    .select(['source_results', 'warnings'])
    .where('id', '=', firstRunId)
    .executeTakeFirstOrThrow();
  const sourceResults = detail.source_results as { decision: string; title: string }[];
  expect(sourceResults.every((entry) => ['adopted', 'skipped'].includes(entry.decision))).toBe(
    true,
  );
  const kept = items.filter((row) => row.relevance === 'accepted');
  expect(
    kept.length,
    `kept count: ${kept.length}, sourceResults: ${JSON.stringify(sourceResults)}`,
  ).toBeGreaterThanOrEqual(1);
  expect(
    kept.every((row) => ['high', 'normal', 'low'].includes(row.importance ?? '')),
    `kept importance: ${kept.map((row) => row.importance).join(',')}`,
  ).toBe(true);
  expect(Array.isArray(detail.warnings)).toBe(true);
  const revision = await database!
    .selectFrom('document_revisions')
    .select(['plain_text', 'title'])
    .where('document_id', '=', run.briefDocumentId!)
    .executeTakeFirstOrThrow();
  expectBriefTitle(revision.title);

  const secondRunId = await runOnce(subscription.id);
  expect(await readItems(subscription.id)).toHaveLength(4);
  const secondBrief = await newsService.getRun(secondRunId);
  const secondRevision = await database!
    .selectFrom('document_revisions')
    .select('plain_text')
    .where('document_id', '=', secondBrief.briefDocumentId!)
    .executeTakeFirstOrThrow();
  expect(secondRevision.plain_text).toContain('本期没有新的资讯条目');
}

describe.skipIf(!llmReady)('news digest with real llm', () => {
  test(
    '真实模型执行简报：条目登记、相关性筛选、重要性落库与去重',
    { timeout: 240_000 },
    expectRealModelDigestFlow,
  );
});
