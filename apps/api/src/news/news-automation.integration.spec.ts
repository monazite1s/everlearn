/**
 * @fileoverview 在真实 PostgreSQL 与 HTTP 边界上验证资讯简报的计划触发、搜索来源采集与自动执行闭环。
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
const judgeFormatMarker = '格式为 {"items"';

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

const searchResults = [
  {
    content: '讨论大模型上下文窗口扩展的工程方案。',
    link: 'https://news.example.com/ctx',
    publish_date: '2026-09-01',
    title: '搜索结果：大模型上下文扩展',
  },
  {
    content: '新增检索增强生成的评测基准与公开数据集。',
    link: 'https://news.example.com/rag',
    publish_date: 'not-a-date',
    title: '搜索结果：检索增强生成评测',
  },
];

let application: INestApplication | undefined;
let appBaseUrl = '';
let database: Kysely<DatabaseSchema> | undefined;
let rssServer: Server | undefined;
let rssUrl = '';
let fixtureServer: Server | undefined;
let newsService: NewsService;
let runsService: NewsRunsService;

/** 用于设置连接级搜索路径且不读取或修改凭据。 */
function createScopedDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set('options', `-csearch_path=${schemaName},public`);
  return url.toString();
}

/** 用于在导入 AppModule 前提供含内部密钥、mock LLM 与 mock GLM 搜索的非生产配置。 */
function applyFixtureEnvironment(scopedDatabaseUrl: string, fixtureBaseUrl: string): void {
  process.env.DATABASE_URL = scopedDatabaseUrl;
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  process.env.S3_ACCESS_KEY = 'integration-test-access';
  process.env.S3_BUCKET = 'integration-test';
  process.env.S3_ENDPOINT = 'http://127.0.0.1:8333';
  process.env.S3_FORCE_PATH_STYLE = 'true';
  process.env.S3_REGION = 'local';
  process.env.S3_SECRET_KEY = 'integration-test-secret';
  process.env.PURGE_TRIGGER_SECRET = internalSecret;
  process.env.LLM_BASE_URL = fixtureBaseUrl;
  process.env.LLM_API_KEY = 'test-llm-key';
  process.env.LLM_MODEL = 'test-model';
  process.env.SEARCH_PROVIDER = 'glm';
  process.env.SEARCH_API_KEY = 'test-search-key';
  process.env.GLM_SEARCH_BASE_URL = fixtureBaseUrl;
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

/** 用于按提示词中的条目编号生成全保留的三合一判定 JSON。 */
function buildJudgeContent(prompt: string): string {
  const indexes = new Set([...prompt.matchAll(/^(\d+)\. /gmu)].map((match) => Number(match[1])));
  const items = [...indexes].map((index) => ({
    importance: index === 0 ? 'high' : 'normal',
    index,
    keep: true,
    summary: `自动摘要${index}`,
  }));
  return JSON.stringify({ items });
}

/** 用于启动按路径分流的 mock LLM 与 mock GLM Web 搜索服务器。 */
async function startFixtureServer(): Promise<string> {
  fixtureServer = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += String(chunk);
    });
    request.on('end', () => {
      const payload = JSON.parse(body) as Record<string, unknown>;
      if (request.url === '/web_search') {
        const query = typeof payload.search_query === 'string' ? payload.search_query : '';
        if (query.includes('搜索失败')) {
          response.writeHead(500, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: 'search upstream failed' }));
          return;
        }
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ search_result: searchResults }));
        return;
      }
      const prompt = (payload.messages as { content: string }[]).at(-1)!.content;
      const content = prompt.includes(judgeFormatMarker)
        ? buildJudgeContent(prompt)
        : `${briefText}\n\n${prompt}`;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise<void>((resolve) => fixtureServer!.listen(0, '127.0.0.1', resolve));
  const address = fixtureServer.address() as AddressInfo;
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
  const fixtureBaseUrl = await startFixtureServer();
  applyFixtureEnvironment(scopedDatabaseUrl, fixtureBaseUrl);
  const { AppModule } = await import('../app.module');
  application = await NestFactory.create(AppModule, { abortOnError: false, logger: false });
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
  await new Promise<void>((resolve) => fixtureServer!.close(() => resolve()));
  await database?.destroy();
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.dropSchema(schemaName).cascade().execute();
  await adminDatabase.destroy();
}

/** 用于构造指向测试内 Nest 应用的 Worker 执行器配置。 */
function createExecutorConfig(): NewsDigestExecutorConfig {
  // 测试源绑定环回地址，须跳过私网 feed 校验。
  return { allowPrivateFeedUrls: true, apiInternalUrl: appBaseUrl, secret: internalSecret };
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

/** 用于领取并执行一次订阅运行，断言终态为 succeeded 并返回运行详情。 */
async function runOnce(subscriptionId: string) {
  await newsService.createRun(subscriptionId);
  const [claimed] = await runsService.claimPendingDigestRuns(5);
  if (claimed === undefined) throw new Error('领取待执行运行失败');
  await executeNewsDigest(claimed, createExecutorConfig());
  const run = await newsService.getRun(claimed.runId);
  expect(run.status, `errorCode=${run.errorCode}`).toBe('succeeded');
  return run;
}

/** 用于读取指定订阅的全部条目行。 */
function readItems(subscriptionId: string) {
  return database!
    .selectFrom('news_items')
    .selectAll()
    .where('subscription_id', '=', subscriptionId)
    .execute();
}

beforeAll(prepareApplication);
afterAll(cleanApplication);

describe('news automation integration', () => {
  test('计划触发当天幂等创建单个 pending 运行', expectScheduleTriggerIdempotent);
  test('执行器经真实 HTTP 抓源、三合一判定并落库为 succeeded', expectExecutorPersistsBrief);
  test('全来源失败生成失败说明并置 succeeded', expectAllSourcesFailedExplains);
  test('终态运行后当天重复计划触发不再创建新运行或新简报', expectNoDuplicateAfterTerminal);
  test('停用计划的订阅不再出现在调度清单中', expectDisabledScheduleExcluded);
  test('搜索来源条目登记、摘要落库并按指纹去重', expectSearchSourceRegistersAndDeduplicates);
  test('单搜索来源失败记警告且不阻塞 RSS 来源', expectSearchFailureWarnsOnly);
});

/** 用于断言计划触发当天幂等创建单个 pending 运行。 */
async function expectScheduleTriggerIdempotent(): Promise<void> {
  const subscription = await newsService.create({
    name: '自动化测试源',
    schedule: { kind: 'daily', time: '08:00', timezone: 'Asia/Shanghai' },
    sources: [{ type: 'rss', value: rssUrl }],
    topic: '自动化测试主题',
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

/** 用于断言执行器经真实 HTTP 抓源、三合一判定并落库为 succeeded。 */
async function expectExecutorPersistsBrief(): Promise<void> {
  const subscription = (await newsService.list()).find((item) => item.name === '自动化测试源')!;
  const [claimed] = await runsService.claimPendingDigestRuns(5);
  if (claimed === undefined) throw new Error('领取待执行运行失败');
  await executeNewsDigest(claimed, createExecutorConfig());
  const run = await newsService.getRun(claimed.runId);
  expect(run.status, `errorCode=${run.errorCode}`).toBe('succeeded');
  const revision = await database!
    .selectFrom('document_revisions')
    .select(['plain_text', 'title'])
    .where('document_id', '=', run.briefDocumentId!)
    .executeTakeFirstOrThrow();
  expect(revision.title).toBe(`自动化测试源·资讯简报 ${new Date().toISOString().slice(0, 10)}`);
  expect(revision.plain_text).toContain(briefText);
  expect(revision.plain_text).toContain('http://127.0.0.1:9/beta');
  const items = await readItems(subscription.id);
  expect(items).toHaveLength(2);
  expect(items.every((row) => row.relevance === 'accepted')).toBe(true);
  expect(items.map((row) => row.importance).sort()).toEqual(['high', 'normal']);
  expect(items.every((row) => row.processed_content.startsWith('自动摘要'))).toBe(true);
  expect(run.sourceResults).toHaveLength(2);
  expect(run.sourceResults.every((entry) => entry.decision === 'adopted')).toBe(true);
  expect(run.warnings).toContain('来源不足，简报仅基于 2 条来源');
}

/** 用于断言全来源失败时生成失败说明文档并置 succeeded。 */
async function expectAllSourcesFailedExplains(): Promise<void> {
  const subscription = await newsService.create({
    name: '失败测试源',
    sources: [{ type: 'rss', value: 'http://127.0.0.1:9/dead-feed.xml' }],
    topic: '失败主题',
  });
  const run = await runOnce(subscription.id);
  expect(run.warnings[0]).toContain('资讯源抓取失败');
  const revision = await database!
    .selectFrom('document_revisions')
    .select(['plain_text', 'title'])
    .where('document_id', '=', run.briefDocumentId!)
    .executeTakeFirstOrThrow();
  expect(revision.title).toContain('失败测试源·资讯简报生成失败说明');
  expect(revision.plain_text).toContain('失败步骤：资讯源抓取');
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

/** 用于断言停用或去计划的订阅不再出现在调度清单中。 */
async function expectDisabledScheduleExcluded(): Promise<void> {
  const scheduled = await newsService.create({
    name: '有计划源',
    sources: [{ type: 'rss', value: rssUrl }],
    topic: '调度主题',
  });
  await newsService.update(scheduled.id, {
    name: '有计划源',
    schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
    sources: [{ type: 'rss', value: rssUrl }],
    topic: '调度主题',
    version: 1,
  });
  expect((await runsService.listSchedules()).map((item) => item.subscriptionId)).toContain(
    scheduled.id,
  );
  await newsService.update(scheduled.id, {
    enabled: false,
    name: '有计划源',
    schedule: { kind: 'daily', time: '09:00', timezone: 'UTC' },
    sources: [{ type: 'rss', value: rssUrl }],
    topic: '调度主题',
    version: 2,
  });
  const remaining = await newsService.create({
    name: '无计划源',
    sources: [{ type: 'rss', value: rssUrl }],
    topic: '无计划主题',
  });
  const ids = (await runsService.listSchedules()).map((item) => item.subscriptionId);
  expect(ids).not.toContain(scheduled.id);
  expect(ids).not.toContain(remaining.id);
}

/** 用于断言搜索来源经内部搜索动作登记条目、三合一摘要落库并在重跑时去重。 */
async function expectSearchSourceRegistersAndDeduplicates(): Promise<void> {
  const subscription = await newsService.create({
    name: '搜索采集源',
    sources: [{ type: 'search', value: 'https://search.example.com/query' }],
    topic: '搜索采集主题',
  });
  const firstRun = await runOnce(subscription.id);
  const items = await readItems(subscription.id);
  expect(items).toHaveLength(2);
  expect(items.every((row) => row.source_type === 'search')).toBe(true);
  expect(items.every((row) => row.discovered_run_id === firstRun.id)).toBe(true);
  const rag = items.find((row) => row.url.includes('/rag'))!;
  expect(rag.published_at).toBeNull();
  const ctx = items.find((row) => row.url.includes('/ctx'))!;
  expect(ctx.importance).toBe('high');
  expect(ctx.processed_content.startsWith('自动摘要')).toBe(true);
  await runOnce(subscription.id);
  expect(await readItems(subscription.id)).toHaveLength(2);
}

/** 用于断言单个搜索来源失败只记结构化警告且不阻塞 RSS 来源采集。 */
async function expectSearchFailureWarnsOnly(): Promise<void> {
  const subscription = await newsService.create({
    name: '搜索失败源',
    sources: [
      { type: 'search', value: 'https://search.example.com/fail' },
      { type: 'rss', value: rssUrl },
    ],
    topic: '搜索失败主题',
  });
  const run = await runOnce(subscription.id);
  const items = await readItems(subscription.id);
  expect(items).toHaveLength(2);
  expect(items.every((row) => row.source_type === 'rss')).toBe(true);
  expect(
    run.warnings.some(
      (entry) => entry.includes('https://search.example.com/fail') && entry.includes('抓取失败'),
    ),
  ).toBe(true);
}
