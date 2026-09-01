/**
 * @fileoverview 在真实 PostgreSQL 与 HTTP 边界上验证资讯简报的计划触发与自动执行闭环。
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
const schemaName = `news_automation_${process.pid}`;
const internalSecret = 'news-automation-secret';
const briefText = '测试简报';

const rssXml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<rss version="2.0"><channel><title>测试源</title>',
  '<item><title>第一篇文章</title>',
  '<link>http://127.0.0.1:9/alpha?utm_source=x</link>',
  '<pubDate>Mon, 31 Aug 2026 01:00:00 GMT</pubDate>',
  '<description>Alpha 摘要</description></item>',
  '<item><title>第二篇文章</title>',
  '<link>http://127.0.0.1:9/beta</link>',
  '<pubDate>Tue, 01 Sep 2026 01:00:00 GMT</pubDate>',
  '<description>Beta 摘要</description></item>',
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

/** 用于在导入 AppModule 前提供含内部密钥与测试 LLM 的非生产配置。 */
function applyFixtureEnvironment(scopedDatabaseUrl: string, llmBaseUrl: string): void {
  process.env.DATABASE_URL = scopedDatabaseUrl;
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  process.env.S3_ACCESS_KEY = 'integration-test-access';
  process.env.S3_BUCKET = 'integration-test';
  process.env.S3_ENDPOINT = 'http://127.0.0.1:8333';
  process.env.S3_FORCE_PATH_STYLE = 'true';
  process.env.S3_REGION = 'local';
  process.env.S3_SECRET_KEY = 'integration-test-secret';
  process.env.PURGE_TRIGGER_SECRET = internalSecret;
  process.env.LLM_BASE_URL = llmBaseUrl;
  process.env.LLM_API_KEY = 'test-llm-key';
  process.env.LLM_MODEL = 'test-model';
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

/** 用于启动回显提示词的 OpenAI 兼容 mock LLM 服务器。 */
async function startLlmServer(): Promise<string> {
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += String(chunk);
    });
    request.on('end', () => {
      const prompt = (JSON.parse(body) as { messages: { content: string }[] }).messages.at(
        -1,
      )!.content;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ choices: [{ message: { content: `${briefText}\n\n${prompt}` } }] }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
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
  const llmBaseUrl = await startLlmServer();
  applyFixtureEnvironment(scopedDatabaseUrl, llmBaseUrl);
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

/** 用于构造指向测试内 Nest 应用的 Worker 执行器配置。 */
function createExecutorConfig(): NewsDigestExecutorConfig {
  return { apiInternalUrl: appBaseUrl, secret: internalSecret };
}

/** 用于按订阅统计简报运行数量。 */
async function countRuns(subscriptionId: string): Promise<number> {
  const rows = await database!
    .selectFrom('news_digest_runs')
    .select('id')
    .where('subscription_id', '=', subscriptionId)
    .execute();
  return rows.length;
}

beforeAll(prepareApplication);
afterAll(cleanApplication);

describe('news automation integration', () => {
  test('计划触发当天幂等创建单个 pending 运行', expectScheduleTriggerIdempotent);
  test('执行器经真实 HTTP 抓源、生成简报并落库为 succeeded', expectExecutorPersistsBrief);
  test('终态运行后当天重复计划触发不再创建新运行或新简报', expectNoDuplicateAfterTerminal);
  test('停用计划的订阅不再出现在调度清单中', expectDisabledScheduleExcluded);
});

/** 用于断言计划触发当天幂等创建单个 pending 运行。 */
async function expectScheduleTriggerIdempotent(): Promise<void> {
  const subscription = await newsService.create({
    feedUrl: rssUrl,
    name: '自动化测试源',
    schedule: { kind: 'daily', time: '08:00', timezone: 'Asia/Shanghai' },
  });
  const first = await runsService.createScheduledDigest(subscription.id);
  expect(await countRuns(subscription.id)).toBe(1);
  const pending = await database!
    .selectFrom('news_digest_runs')
    .select('status')
    .where('id', '=', first.runId)
    .executeTakeFirstOrThrow();
  expect(pending.status).toBe('pending');
  const second = await runsService.createScheduledDigest(subscription.id);
  expect(second.runId).toBe(first.runId);
  expect(await countRuns(subscription.id)).toBe(1);
}

/** 用于断言执行器经真实 HTTP 抓源、生成简报并落库为 succeeded。 */
async function expectExecutorPersistsBrief(): Promise<void> {
  const subscription = (await newsService.list()).find((item) => item.name === '自动化测试源')!;
  const [claimed] = await runsService.claimPendingDigestRuns(5);
  expect(claimed?.runId).toBeTruthy();
  if (claimed === undefined) throw new Error('领取待执行运行失败');
  await executeNewsDigest(claimed, createExecutorConfig());
  const run = await database!
    .selectFrom('news_digest_runs')
    .select(['brief_document_id', 'error_code', 'status'])
    .where('id', '=', claimed.runId)
    .executeTakeFirstOrThrow();
  expect(run.status, `errorCode=${run.error_code}`).toBe('succeeded');
  expect(run.error_code).toBeNull();
  const document = await database!
    .selectFrom('documents')
    .select('knowledge_base_id')
    .where('id', '=', run.brief_document_id!)
    .executeTakeFirstOrThrow();
  expect(document.knowledge_base_id).toBe(subscription.newsKnowledgeBaseId);
  const revision = await database!
    .selectFrom('document_revisions')
    .select(['plain_text', 'title'])
    .where('document_id', '=', run.brief_document_id!)
    .executeTakeFirstOrThrow();
  expect(revision.title).toBe(`资讯简报 ${new Date().toISOString().slice(0, 10)}`);
  expect(revision.plain_text).toContain(briefText);
  expect(revision.plain_text).toContain('http://127.0.0.1:9/beta');
  expect(revision.plain_text).toContain('http://127.0.0.1:9/alpha');
}

/** 用于断言终态运行后当天重复计划触发不再创建新运行或新简报。 */
async function expectNoDuplicateAfterTerminal(): Promise<void> {
  const subscription = (await newsService.list()).find((item) => item.name === '自动化测试源')!;
  const before = await database!
    .selectFrom('documents')
    .select('id')
    .where('knowledge_base_id', '=', subscription.newsKnowledgeBaseId)
    .execute();
  const again = await runsService.createScheduledDigest(subscription.id);
  expect(await countRuns(subscription.id)).toBe(1);
  const after = await database!
    .selectFrom('documents')
    .select('id')
    .where('knowledge_base_id', '=', subscription.newsKnowledgeBaseId)
    .execute();
  expect(after.length).toBe(before.length);
  await expect(runsService.completeDigestRun(again.runId, { status: 'succeeded' })).rejects.toThrow(
    /终态/u,
  );
}

/** 用于断言停用计划的订阅不再出现在调度清单中。 */
async function expectDisabledScheduleExcluded(): Promise<void> {
  const scheduled = await newsService.create({ feedUrl: rssUrl, name: '有计划源' });
  await newsService.update(scheduled.id, {
    schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
  });
  expect((await runsService.listSchedules()).map((item) => item.subscriptionId)).toContain(
    scheduled.id,
  );
  await newsService.update(scheduled.id, { schedule: null });
  const remaining = await newsService.create({ feedUrl: rssUrl, name: '无计划源' });
  const ids = (await runsService.listSchedules()).map((item) => item.subscriptionId);
  expect(ids).not.toContain(scheduled.id);
  expect(ids).not.toContain(remaining.id);
}
