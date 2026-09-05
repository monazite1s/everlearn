/**
 * @fileoverview 用真实 GLM 搜索与 LLM 执行纯搜索来源订阅的全流程，验证搜索管道与三合一判定真实链路，环境缺失时跳过。
 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createDatabaseClient } from '../database/database.service';
import type { DatabaseSchema } from '../database/database.types';
import { runMigrations } from '../database/migration-runner';
import { NewsRunsService } from './news-runs.service';
import { NewsService } from './news.service';
import { executeNewsDigest } from '../../../worker/src/news/news-digest.executor';
import type { NewsDigestExecutorConfig } from '../../../worker/src/news/news-digest.executor';

const databaseUrl = process.env.DATABASE_URL;
const schemaName = `news_search_llm_${process.pid}`;
const internalSecret = 'news-search-llm-secret';
const llmReady = Boolean(
  process.env.LLM_BASE_URL && process.env.LLM_API_KEY && process.env.LLM_MODEL,
);
const searchReady = process.env.SEARCH_PROVIDER === 'glm' && Boolean(process.env.SEARCH_API_KEY);
const subscriptionTopic = 'AI 编程助手最新进展';

let application: INestApplication | undefined;
let appBaseUrl = '';
let database: Kysely<DatabaseSchema> | undefined;
let newsService: NewsService;
let runsService: NewsRunsService;

/** 用于设置连接级搜索路径且不读取或修改凭据。 */
function createScopedDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set('options', `-csearch_path=${schemaName},public`);
  return url.toString();
}

/** 用于在导入 AppModule 前提供除模型与搜索外的测试基础设施配置，搜索与模型走真实环境。 */
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
  applyFixtureEnvironment(scopedDatabaseUrl);
  const { AppModule } = await import('../app.module');
  application = await NestFactory.create(AppModule, { abortOnError: false, logger: false });
  application.setGlobalPrefix('api/v1');
  await application.listen(0);
  appBaseUrl = (await application.getUrl()).replace('[::1]', '127.0.0.1').replace(/\/$/, '');
  newsService = application.get(NewsService);
  runsService = application.get(NewsRunsService);
}

/** 用于关闭应用与隔离 Schema。 */
async function cleanApplication(): Promise<void> {
  await application?.close();
  await database?.destroy();
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.dropSchema(schemaName).cascade().execute();
  await adminDatabase.destroy();
}

beforeAll(prepareApplication);
afterAll(cleanApplication);

describe.skipIf(!llmReady || !searchReady)('news search source with real glm', () => {
  test(
    '纯搜索订阅真实执行：条目登记、中文摘要落库与重要性分布',
    { timeout: 240_000 },
    expectRealSearchDigestFlow,
  );
});

/** 用于断言纯搜索订阅在真实 GLM 下的条目登记、摘要与重要性分布。 */
async function expectRealSearchDigestFlow(): Promise<void> {
  const subscription = await newsService.create({
    includeKeywords: ['AI 编程', '代码生成'],
    name: subscriptionTopic,
    sources: [{ type: 'search', value: 'https://search.example.com/seed' }],
    topic: subscriptionTopic,
  });
  await newsService.createRun(subscription.id);
  const [claimed] = await runsService.claimPendingDigestRuns(5);
  if (claimed === undefined) throw new Error('领取待执行运行失败');
  const config: NewsDigestExecutorConfig = { apiInternalUrl: appBaseUrl, secret: internalSecret };
  await executeNewsDigest(claimed, config);
  const run = await database!
    .selectFrom('news_digest_runs')
    .select(['brief_document_id', 'error_code', 'status', 'warnings'])
    .where('id', '=', claimed.runId)
    .executeTakeFirstOrThrow();
  expect(run.status, `errorCode=${run.error_code}`).toBe('succeeded');
  const items = await database!
    .selectFrom('news_items')
    .selectAll()
    .where('subscription_id', '=', subscription.id)
    .execute();
  expect(items.length, `warnings: ${JSON.stringify(run.warnings)}`).toBeGreaterThanOrEqual(1);
  expect(items.every((row) => row.source_type === 'search')).toBe(true);
  expect(items.every((row) => row.snippet.length > 0)).toBe(true);
  const kept = items.filter((row) => row.relevance === 'accepted');
  expect(kept.length).toBeGreaterThanOrEqual(1);
  // 真实模型三合一输出可解析：accepted 条目应带中文摘要。
  expect(
    kept.every((row) => row.processed_content.length > 0),
    `summaries: ${JSON.stringify(kept.map((row) => row.processed_content))}`,
  ).toBe(true);
  expect(
    kept.some((row) => row.importance !== 'normal'),
    `importance: ${JSON.stringify(kept.map((row) => row.importance))}`,
  ).toBe(true);
}
