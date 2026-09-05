/**
 * @fileoverview 在真实 PostgreSQL 与 HTTP 边界上验证 compose 对话历史取最近窗口与提示词裁剪语义。
 */

import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import { afterAll, beforeAll, expect, test } from 'vitest';

import { createDatabaseClient } from '../database/database.service';
import type { DatabaseSchema } from '../database/database.types';
import { runMigrations } from '../database/migration-runner';
import { applyFixtureEnvironment, scopedUrl } from './tutorial-compose.fixture';
import type { ComposeHistoryItem } from './compose/compose-agent';
import { TutorialConversationsService } from './tutorial-conversations.service';
import { TutorialService } from './tutorial.service';

const databaseUrl = process.env.DATABASE_URL;
const schemaName = `tutorial_history_${process.pid}_${Date.now()}`;

/** 最近一次 LLM 请求携带的消息序列，由捕获服务器写入。 */
let capturedMessages: { content: string; role: string }[] = [];

let app: INestApplication;
let appBaseUrl = '';
let database: Kysely<DatabaseSchema>;
let llmServer: Server;

/** 用于启动记录请求消息并返回固定 compose 回复的 mock LLM 服务器。 */
async function startCaptureLlmServer(): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += String(chunk);
    });
    request.on('end', () => {
      const parsed = JSON.parse(body) as { messages: { content: string; role: string }[] };
      capturedMessages = parsed.messages;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ choices: [{ message: { content: '{"reply":"好的","proposal":null}' } }] }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

beforeAll(async () => {
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.createSchema(schemaName).execute();
  await adminDatabase.destroy();
  database = await createDatabaseClient(scopedUrl(databaseUrl!, schemaName));
  await runMigrations(database, {
    direction: 'up',
    migrationLockTableName: 'migration_lock',
    migrationTableName: 'migration_history',
    migrationTableSchema: schemaName,
  });
  const llm = await startCaptureLlmServer();
  llmServer = llm.server;
  applyFixtureEnvironment(llm.baseUrl, scopedUrl(databaseUrl!, schemaName));
  const { AppModule } = await import('../app.module');
  app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  await app.listen(0);
  appBaseUrl = (await app.getUrl()).replace('[::1]', '127.0.0.1').replace(/\/$/, '');
}, 30_000);

afterAll(async () => {
  await app.close();
  await new Promise<void>((resolve) => llmServer.close(() => resolve()));
  await database.destroy();
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.dropSchema(schemaName).cascade().execute();
  await adminDatabase.destroy();
}, 30_000);

/** 用于按创建时间递增写入 60 条 user/agent 交替的对话消息。 */
async function seedMessages(conversationId: string): Promise<void> {
  const base = Date.now();
  for (let index = 1; index <= 60; index += 1) {
    await database
      .insertInto('tutorial_messages')
      .values({
        content: `消息${String(index).padStart(2, '0')}`,
        conversation_id: conversationId,
        created_at: new Date(base - (61 - index) * 1000),
        id: randomUUID(),
        proposal: null,
        role: index % 2 === 1 ? 'user' : 'agent',
      })
      .execute();
  }
}

/** 用于以测试视角调用服务私有 readHistory 的最小接口。 */
interface HistoryProbe {
  readHistory: (conversationId: string) => Promise<ComposeHistoryItem[]>;
}

test('readHistory 取第 11-60 条升序，compose 提示词保留最近 20 条', async () => {
  const tutorialService = app.get(TutorialService);
  const session = await tutorialService.create({
    audience: '后端工程师',
    depth: 'standard',
    excludeTopics: [],
    goals: '',
    includeTopics: [],
    knowledgeBaseIds: [],
    level: 50,
    topic: '历史裁剪',
  });
  const conversationId = randomUUID();
  await database
    .insertInto('tutorial_conversations')
    .values({ id: conversationId, session_id: session.id, status: 'active', title: '历史裁剪' })
    .execute();
  await seedMessages(conversationId);

  const conversations = app.get<TutorialConversationsService, HistoryProbe>(
    TutorialConversationsService,
  );
  const history = await conversations.readHistory.call(conversations, conversationId);
  const expected = Array.from(
    { length: 50 },
    (_, index) => `消息${String(index + 11).padStart(2, '0')}`,
  );
  expect(history.map((item) => item.content)).toEqual(expected);

  const response = await fetch(`${appBaseUrl}/api/v1/tutorials/${session.id}/compose/messages`, {
    body: JSON.stringify({ content: '最新提问' }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
  expect(response.status).toBe(200);
  const expectedPrompt = Array.from(
    { length: 20 },
    (_, index) => `消息${String(index + 41).padStart(2, '0')}`,
  );
  expect(capturedMessages.slice(1, -1).map((message) => message.content)).toEqual(expectedPrompt);
});
