/**
 * @fileoverview 在真实 PostgreSQL 与 HTTP 边界上验证教程两次确认、章节生成、重试与取消。
 */

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import { afterAll, beforeAll, expect, test } from 'vitest';

import { createDatabaseClient } from '../database/database.service';
import type { DatabaseSchema } from '../database/database.types';
import { runMigrations } from '../database/migration-runner';
import {
  createChapterDeps,
  executeTutorialChapter,
} from '../../../worker/src/tutorials/tutorial-chapter.executor';
import type { ChapterItem } from '../../../worker/src/tutorials/tutorial-chapter.executor';
import {
  createOutlineDeps,
  executeTutorialOutline,
} from '../../../worker/src/tutorials/tutorial-outline.executor';
import { TutorialRunsService } from './tutorial-runs.service';
import { TutorialService } from './tutorial.service';

const databaseUrl = process.env.DATABASE_URL;
const schemaName = `tutorial_flow_${process.pid}_${Date.now()}`;
const internalSecret = 'tutorial-flow-secret';
const OUTLINE_JSON =
  '{"chapters":[{"nodeKey":"intro","title":"入门","summary":"基础","dependsOn":[]},' +
  '{"nodeKey":"advanced","title":"进阶","summary":"高级","dependsOn":["intro"]}]}';

let app: INestApplication;
let appBaseUrl = '';
let database: Kysely<DatabaseSchema>;
let llmServer: Server;
let runsService: TutorialRunsService;
let tutorialService: TutorialService;

/** 用于设置连接级搜索路径且不读取或修改凭据。 */
function scopedUrl(): string {
  const url = new URL(databaseUrl!);
  url.searchParams.set('options', `-csearch_path=${schemaName},public`);
  return url.toString();
}

/** 用于启动按提示词区分大纲与正文的 mock LLM 服务器。 */
async function startLlmServer(): Promise<string> {
  llmServer = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += String(chunk);
    });
    request.on('end', () => {
      const prompt = (JSON.parse(body) as { messages: { content: string }[] }).messages.at(
        -1,
      )!.content;
      const content = prompt.includes('大纲') ? OUTLINE_JSON : '# 章节正文\n\n这是生成内容 [1]。';
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise<void>((resolve) => llmServer.listen(0, '127.0.0.1', resolve));
  const address = llmServer.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

/** 用于在导入 AppModule 前提供含内部密钥与测试 LLM 的非生产配置。 */
function applyFixtureEnvironment(llmBaseUrl: string): void {
  process.env.DATABASE_URL = scopedUrl();
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
  delete process.env.SEARCH_PROVIDER;
  delete process.env.SEARCH_API_KEY;
}

beforeAll(async () => {
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.createSchema(schemaName).execute();
  await adminDatabase.destroy();
  database = await createDatabaseClient(scopedUrl());
  await runMigrations(database, {
    direction: 'up',
    migrationLockTableName: 'migration_lock',
    migrationTableName: 'migration_history',
    migrationTableSchema: schemaName,
  });
  applyFixtureEnvironment(await startLlmServer());
  const { AppModule } = await import('../app.module');
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  await app.listen(0);
  appBaseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1').replace(/\/$/, '');
  tutorialService = app.get(TutorialService);
  runsService = app.get(TutorialRunsService);
}, 30_000);

afterAll(async () => {
  await app.close();
  await new Promise<void>((resolve) => llmServer.close(() => resolve()));
  await database.destroy();
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.dropSchema(schemaName).cascade().execute();
  await adminDatabase.destroy();
}, 30_000);

/** 用于构造指向测试内 Nest 应用的执行器依赖。 */
function outlineDeps(sessionId: string) {
  return createOutlineDeps({ apiInternalUrl: appBaseUrl, secret: internalSecret }, sessionId);
}

/** 用于构造章节执行依赖，llm 缺省时走 mock 服务器。 */
function chapterDepsFor(chapterId: string, llm?: () => Promise<string>) {
  const base = createChapterDeps({ apiInternalUrl: appBaseUrl, secret: internalSecret }, chapterId);
  return llm === undefined ? base : { ...base, llm };
}

/** 用于创建已确认范围的测试会话并返回 id。 */
async function createConfirmedSession(topic = 'Kysely 入门'): Promise<string> {
  const draft = await tutorialService.create({
    audience: '后端工程师',
    depth: 'standard',
    excludeTopics: [],
    goals: '',
    includeTopics: [],
    knowledgeBaseIds: [],
    level: 50,
    topic,
  });
  await tutorialService.confirmScope(draft.id);
  return draft.id;
}

/** 用于把会话推进到大纲可编辑态并把无关 researching 会话排空。 */
async function reachOutlineReady(sessionId: string): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    const items = await runsService.claimOutlineSessions(3);
    if (items.length === 0) break;
    for (const item of items) {
      await executeTutorialOutline(item, outlineDeps(item.sessionId));
    }
    if (items.some((item) => item.sessionId === sessionId)) return;
  }
  throw new Error(`未领取到目标会话 ${sessionId}`);
}

/** 用于读取指定会话的章节详情列表。 */
async function readChapters(sessionId: string) {
  return (await tutorialService.detail(sessionId)).chapters;
}

/** 用于领取指定会话的下一章节并把无关会话章节排空。 */
async function claimChapterOf(sessionId: string): Promise<ChapterItem | undefined> {
  const ownIds = new Set((await readChapters(sessionId)).map((chapter) => chapter.id));
  for (let round = 0; round < 10; round += 1) {
    const items = await runsService.claimReadyChapters(5);
    if (items.length === 0) return undefined;
    const match = items.find((item) => ownIds.has(item.chapterId));
    for (const item of items) {
      if (item !== match) await executeTutorialChapter(item, chapterDepsFor(item.chapterId));
    }
    if (match !== undefined) return match;
  }
  return undefined;
}

test('两次确认全流程：研究、编辑大纲、建库占位、无依赖章节生成', async () => {
  const sessionId = await createConfirmedSession();
  await reachOutlineReady(sessionId);
  expect((await tutorialService.detail(sessionId)).status).toBe('outline_ready');
  expect(
    await warnings(sessionId).then((w) =>
      w.some((item) => item.startsWith('web_search_unavailable')),
    ),
  ).toBe(true);
  await editOutline(sessionId);
  await expectConfirmOutlineIdempotent(sessionId);
  await expectFirstChapterOnly(sessionId);
  await expectDependentReleased(sessionId);
});

test('单章失败不阻塞他章，重试幂等且 attempt 递增，终态 completed', async () => {
  const sessionId = await createConfirmedSession();
  await reachOutlineReady(sessionId);
  await tutorialService.confirmOutline(sessionId);
  const chapters = await readChapters(sessionId);
  await failChapterOf(sessionId, chapters[0]!.id);
  await expect(runsService.claimReadyChapters(5)).resolves.toHaveLength(0);
  expect((await tutorialService.detail(sessionId)).status).toBe('generating');
  await expectRetryIdempotent(sessionId, chapters[0]!.id);
  const second = await claimChapterOf(sessionId);
  expect(second?.chapterId).toBe(chapters[1]!.id);
  await executeTutorialChapter(second!, chapterDepsFor(second!.chapterId));
  expect((await tutorialService.detail(sessionId)).status).toBe('completed');
});

test('取消未开始章节后不再被领取，存在失败时会话进入 partial', async () => {
  const sessionId = await createConfirmedSession();
  await reachOutlineReady(sessionId);
  await tutorialService.confirmOutline(sessionId);
  const first = await claimChapterOf(sessionId);
  await executeTutorialChapter(
    first!,
    chapterDepsFor(first!.chapterId, () => Promise.reject(new Error('llm down'))),
  );
  const canceled = await tutorialService.cancel(sessionId);
  expect(canceled.chapters.find((chapter) => chapter.nodeKey === 'advanced')?.status).toBe(
    'canceled',
  );
  expect(canceled.status).toBe('partial');
  await expect(claimChapterOf(sessionId)).resolves.toBeUndefined();
});

/** 用于读取会话告警列表。 */
async function warnings(sessionId: string): Promise<readonly string[]> {
  return (await tutorialService.detail(sessionId)).warnings;
}

/** 用于编辑大纲并断言写入成功。 */
async function editOutline(sessionId: string): Promise<void> {
  const detail = await tutorialService.updateOutline(sessionId, {
    chapters: [
      { dependsOn: [], nodeKey: 'intro', summary: '基础概念', title: '入门（改）' },
      { dependsOn: ['intro'], nodeKey: 'advanced', summary: '高级用法', title: '进阶（改）' },
    ],
  });
  expect(detail.outline?.chapters[0]?.title).toBe('入门（改）');
}

/** 用于断言重复确认大纲幂等且知识库、章节、占位文档已原子创建。 */
async function expectConfirmOutlineIdempotent(sessionId: string): Promise<void> {
  const confirmed = await tutorialService.confirmOutline(sessionId);
  expect(confirmed.status).toBe('generating');
  const repeated = await tutorialService.confirmOutline(sessionId);
  expect(repeated.tutorialKnowledgeBaseId).toBe(confirmed.tutorialKnowledgeBaseId);
  const kbRow = await database
    .selectFrom('knowledge_bases')
    .select('kind')
    .where('id', '=', confirmed.tutorialKnowledgeBaseId!)
    .executeTakeFirstOrThrow();
  expect(kbRow.kind).toBe('tutorial');
  const chapters = await readChapters(sessionId);
  expect(chapters).toHaveLength(2);
  expect(chapters.every((chapter) => chapter.documentId !== null)).toBe(true);
}

/** 用于断言首次只领取无依赖章节并写入新修订。 */
async function expectFirstChapterOnly(sessionId: string): Promise<void> {
  const chapters = await readChapters(sessionId);
  const item = await claimChapterOf(sessionId);
  expect(item?.chapterId).toBe(chapters[0]!.id);
  await executeTutorialChapter(item!, chapterDepsFor(item!.chapterId));
  const updated = await readChapters(sessionId);
  expect(updated[0]!.status).toBe('succeeded');
  expect(updated[0]!.attempt).toBe(1);
}

/** 用于断言依赖成功后进阶章节被释放且占位文档获得新修订。 */
async function expectDependentReleased(sessionId: string): Promise<void> {
  const chapters = await readChapters(sessionId);
  const revision = await database
    .selectFrom('document_revisions')
    .select(({ fn }) => fn.countAll().as('count'))
    .where('document_id', '=', chapters[0]!.documentId!)
    .executeTakeFirstOrThrow();
  expect(Number(revision.count)).toBe(2);
  const document = await database
    .selectFrom('documents')
    .select('plain_text')
    .where('id', '=', chapters[0]!.documentId!)
    .executeTakeFirstOrThrow();
  expect(document.plain_text).toContain('章节正文');
  const item = await claimChapterOf(sessionId);
  expect(item?.chapterId).toBe(chapters[1]!.id);
  await executeTutorialChapter(item!, chapterDepsFor(item!.chapterId));
  expect((await tutorialService.detail(sessionId)).status).toBe('completed');
}

/** 用于断言重复重试只生效一次且 attempt 递增。 */
async function expectRetryIdempotent(sessionId: string, chapterId: string): Promise<void> {
  await tutorialService.retryChapter(sessionId, chapterId);
  await tutorialService.retryChapter(sessionId, chapterId);
  const retryItem = await claimChapterOf(sessionId);
  expect(retryItem?.chapterId).toBe(chapterId);
  expect(retryItem?.attempt).toBe(2);
  await executeTutorialChapter(retryItem!, chapterDepsFor(retryItem!.chapterId));
}

/** 用于把指定章节执行到失败。 */
async function failChapterOf(sessionId: string, chapterId: string): Promise<void> {
  const first = await claimChapterOf(sessionId);
  expect(first?.chapterId).toBe(chapterId);
  await executeTutorialChapter(
    first!,
    chapterDepsFor(first!.chapterId, () => Promise.reject(new Error('llm down'))),
  );
}
