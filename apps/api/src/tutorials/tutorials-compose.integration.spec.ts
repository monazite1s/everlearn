/**
 * @fileoverview 在真实 PostgreSQL 与 HTTP 边界上验证 compose 会话、提案副作用、占位授权与三视图。
 */

import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';

import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import { sql } from 'kysely';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { createDatabaseClient } from '../database/database.service';
import type { DatabaseSchema } from '../database/database.types';
import { runMigrations } from '../database/migration-runner';
import {
  createOutlineDeps,
  executeTutorialOutline,
} from '../../../worker/src/tutorials/tutorial-outline.executor';
import {
  applyFixtureEnvironment,
  internalSecret,
  outlineProposalPayload,
  scopePayload,
  scopedUrl,
  startLlmServer,
} from './tutorial-compose.fixture';
import { TutorialRunsService } from './tutorial-runs.service';
import { TutorialService } from './tutorial.service';

const databaseUrl = process.env.DATABASE_URL;
const schemaName = `tutorial_compose_${process.pid}_${Date.now()}`;
const OUTLINE_JSON =
  '{"chapters":[{"nodeKey":"intro","title":"入门","summary":"基础","dependsOn":[]},' +
  '{"nodeKey":"advanced","title":"进阶","summary":"高级","dependsOn":["intro"]}]}';

let app: INestApplication;
let appBaseUrl = '';
let database: Kysely<DatabaseSchema>;
let llmServer: Server;
let runsService: TutorialRunsService;
let tutorialService: TutorialService;

/** 下一次 compose 模型输出，由各测试用例在发送消息前设置。 */
let nextComposeReply = '好的，请告诉我你的想法。';

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
  const llm = await startLlmServer(() => nextComposeReply, OUTLINE_JSON);
  llmServer = llm.server;
  applyFixtureEnvironment(llm.baseUrl, scopedUrl(databaseUrl!, schemaName));
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

/** 用于向测试内 Nest 应用发起 JSON 请求并返回状态与响应体。 */
async function callApi(method: 'GET' | 'POST', path: string, body?: unknown) {
  const response = await fetch(`${appBaseUrl}/api/v1${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { 'content-type': 'application/json' },
    method,
  });
  return {
    body: response.status === 204 ? undefined : ((await response.json()) as unknown),
    status: response.status,
  };
}

/** 用于创建 draft_scope 会话。 */
async function createDraft(topic = 'Kysely 入门'): Promise<string> {
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
  return draft.id;
}

/** 用于把会话推进到 awaiting_outline。 */
async function reachOutlineReady(sessionId: string): Promise<void> {
  for (let round = 0; round < 10; round += 1) {
    const items = await runsService.claimOutlineSessions(3);
    if (items.length === 0) break;
    for (const item of items) {
      const deps = createOutlineDeps(
        { apiInternalUrl: appBaseUrl, secret: internalSecret },
        item.sessionId,
      );
      await executeTutorialOutline(item, deps);
    }
    if (items.some((item) => item.sessionId === sessionId)) return;
  }
  throw new Error(`未领取到目标会话 ${sessionId}`);
}

/** 用于创建已建库（generating）的会话并返回详情。 */
async function reachGenerating(topic: string) {
  const sessionId = await createDraft(topic);
  await tutorialService.confirmScope(sessionId);
  await reachOutlineReady(sessionId);
  await tutorialService.confirmOutline(sessionId);
  return tutorialService.detail(sessionId);
}

/** 发送对话消息后返回的 Agent 消息标识与 HTTP 状态。 */
interface SentMessage {
  readonly agentMessageId: string;
  readonly status: number;
}

/** 用于发送对话消息并返回最后一条（Agent）消息的标识。 */
async function sendAndRead(sessionId: string, content: string): Promise<SentMessage> {
  const { body, status } = await callApi('POST', `/tutorials/${sessionId}/compose/messages`, {
    content,
  });
  const messages = body as { id: string }[];
  return { agentMessageId: messages.at(-1)!.id, status };
}

/** 用于读取 compose 会话快照。 */
async function readSnapshot(sessionId: string) {
  return callApi('GET', `/tutorials/${sessionId}/compose`);
}

/** 用于接受指定提案并返回状态与响应体。 */
async function acceptProposal(sessionId: string, messageId: string) {
  return callApi('POST', `/tutorials/${sessionId}/compose/proposals/${messageId}/accept`);
}

/** 用于构造携带提案的 compose 模型输出。 */
function proposalReply(reply: string, kind: string, payload: unknown): string {
  return JSON.stringify({ proposal: { kind, payload }, reply });
}

/** 用于读取文档当前纯文本。 */
async function readDocumentText(documentId: string): Promise<string> {
  const row = await database
    .selectFrom('documents')
    .select('plain_text')
    .where('id', '=', documentId)
    .executeTakeFirstOrThrow();
  return row.plain_text;
}

/** 用于断言文档修订数量。 */
async function expectRevisionCount(documentId: string, count: number): Promise<void> {
  const row = await database
    .selectFrom('document_revisions')
    .select(({ fn }) => fn.countAll().as('count'))
    .where('document_id', '=', documentId)
    .executeTakeFirstOrThrow();
  expect(Number(row.count)).toBe(count);
}

/** 用于模拟用户手工修订章节文档（追加 manual 修订并同步正文）。 */
async function simulateManualEdit(documentId: string): Promise<void> {
  await database.transaction().execute(async (tx) => {
    const document = await tx
      .selectFrom('documents')
      .select(['owner_id', 'version'])
      .where('id', '=', documentId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    const revision = {
      content_json: { content: [], type: 'doc' } as never,
      created_by: document.owner_id,
      document_id: documentId,
      id: randomUUID(),
      owner_id: document.owner_id,
      plain_text: '# 用户手工修改',
      revision_number: 2,
      schema_version: 1,
      source: 'manual' as const,
      title: '手工标题',
    };
    await tx.insertInto('document_revisions').values(revision).executeTakeFirstOrThrow();
    await tx
      .updateTable('documents')
      .set({ plain_text: '# 用户手工修改', version: document.version + 1 })
      .where('id', '=', documentId)
      .executeTakeFirstOrThrow();
  });
}

/** 用于统计指定会话的 active 对话数。 */
async function countActiveConversations(sessionId: string): Promise<number> {
  const row = await database
    .selectFrom('tutorial_conversations')
    .select(({ fn }) => fn.countAll().as('count'))
    .where('session_id', '=', sessionId)
    .where('status', '=', 'active')
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

test('快照读取创建唯一对话并合成闸门卡：纯文本与提案消息落库', async () => {
  const sessionId = await createDraft('对话流转');
  const first = await readSnapshot(sessionId);
  expect(first.status).toBe(200);
  const snapshot = first.body as Record<string, unknown>;
  expect(snapshot.status).toBe('draft_scope');
  expect(snapshot.topic).toBe('对话流转');
  const messages = snapshot.messages as Record<string, unknown>[];
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({
    card: { gate: 'scope', state: 'pending', variant: 'gate' },
    role: 'agent',
  });
  await readSnapshot(sessionId);
  await expect(countActiveConversations(sessionId)).resolves.toBe(1);

  nextComposeReply = '请描述你的受众。';
  const plain = await sendAndRead(sessionId, '你好');
  expect(plain.status).toBe(202);

  nextComposeReply = proposalReply('建议这样调整范围。', 'scope', scopePayload);
  const withProposal = await sendAndRead(sessionId, '帮我调整范围');
  expect(withProposal.status).toBe(202);
  const detail = await readSnapshot(sessionId);
  const latest = (detail.body as { messages: Record<string, unknown>[] }).messages
    .filter((message) => (message.card as Record<string, unknown> | null)?.variant === 'proposal')
    .at(-1);
  expect(latest).toMatchObject({
    card: { state: 'pending', title: '范围调整提案', variant: 'proposal' },
  });
});

test('提案拒绝零副作用且幂等，接受进入研究闸门且幂等', async () => {
  const sessionId = await createDraft('拒绝与接受');
  await readSnapshot(sessionId);

  nextComposeReply = proposalReply('提案一', 'scope', scopePayload);
  const rejected = await sendAndRead(sessionId, '调整范围');
  const rejectPath = `/tutorials/${sessionId}/compose/proposals/${rejected.agentMessageId}/reject`;
  const expectRejected = { body: { proposalStatus: 'rejected' }, status: 200 };
  await expect(callApi('POST', rejectPath)).resolves.toEqual(expectRejected);
  expect((await tutorialService.detail(sessionId)).scope.topic).toBe('拒绝与接受');
  await expect(callApi('POST', rejectPath)).resolves.toEqual(expectRejected);
  const rejectedAccept = await acceptProposal(sessionId, rejected.agentMessageId);
  expect(rejectedAccept.status).toBe(409);
  expect((rejectedAccept.body as Record<string, unknown>).code).toBe(
    'TUTORIAL_PROPOSAL_NOT_PENDING',
  );

  nextComposeReply = proposalReply('提案二', 'scope', scopePayload);
  const accepted = await sendAndRead(sessionId, '这次接受');
  const accept = await acceptProposal(sessionId, accepted.agentMessageId);
  expect(accept.status).toBe(200);
  const acceptBody = accept.body as Record<string, unknown>;
  expect(acceptBody.proposalStatus).toBe('accepted');
  expect((acceptBody.tutorial as Record<string, unknown>).status).toBe('researching');
  expect((await tutorialService.detail(sessionId)).scope.topic).toBe('Kysely 入门（改）');
  const repeated = await acceptProposal(sessionId, accepted.agentMessageId);
  expect(repeated.status).toBe(200);
  const repeatedTutorial = (repeated.body as Record<string, unknown>).tutorial as {
    status: unknown;
  };
  expect(repeatedTutorial.status).toBe('researching');
});

test('大纲提案接受触发原子建库，graph 端点返回节点与依赖边', async () => {
  const sessionId = await createDraft('建库与三视图');
  await tutorialService.confirmScope(sessionId);
  await expect(tutorialService.graph(sessionId)).resolves.toEqual({ edges: [], nodes: [] });
  await reachOutlineReady(sessionId);
  await readSnapshot(sessionId);
  nextComposeReply = proposalReply('大纲已就绪。', 'outline', outlineProposalPayload);
  const { agentMessageId } = await sendAndRead(sessionId, '确认大纲');
  const accept = await acceptProposal(sessionId, agentMessageId);
  const tutorial = (accept.body as Record<string, unknown>).tutorial as Record<string, unknown>;
  expect(tutorial.status).toBe('generating');
  expect(tutorial.tutorialKnowledgeBaseId).not.toBeNull();
  const graph = await tutorialService.graph(sessionId);
  expect(graph.nodes.map((node) => [node.nodeKey, node.status, node.documentId !== null])).toEqual([
    ['intro', 'placeholder', true],
    ['advanced', 'placeholder', true],
  ]);
  expect(graph.edges).toEqual([{ from: 'intro', to: 'advanced' }]);
  const repeated = await acceptProposal(sessionId, agentMessageId);
  const repeatedKb = (repeated.body as Record<string, unknown>).tutorial as {
    tutorialKnowledgeBaseId: unknown;
  };
  expect(repeatedKb.tutorialKnowledgeBaseId).toEqual(tutorial.tutorialKnowledgeBaseId);
});

test('章节提案在无用户编辑时直接写入新修订', async () => {
  const { chapters, id: sessionId } = await reachGenerating('占位授权');
  const intro = chapters.find((chapter) => chapter.nodeKey === 'intro')!;
  await readSnapshot(sessionId);
  nextComposeReply = proposalReply('已重写。', 'chapter', {
    markdown: '# Agent 重写 intro',
    nodeKey: 'intro',
  });
  const first = await sendAndRead(sessionId, '重写第一章');
  const accept = await acceptProposal(sessionId, first.agentMessageId);
  expect(accept.status).toBe(200);
  await expect(readDocumentText(intro.documentId!)).resolves.toContain('Agent 重写 intro');
  await expectRevisionCount(intro.documentId!, 2);
});

test('检测到手工修订时拒绝并可差异接受', async () => {
  const { chapters, id: sessionId } = await reachGenerating('占位授权冲突');
  const advanced = chapters.find((chapter) => chapter.nodeKey === 'advanced')!;
  await readSnapshot(sessionId);
  nextComposeReply = proposalReply('再写一章。', 'chapter', {
    markdown: '# Agent 想覆盖 advanced',
    nodeKey: 'advanced',
  });
  const second = await sendAndRead(sessionId, '重写第二章');
  await simulateManualEdit(advanced.documentId!);
  const messageId = second.agentMessageId;
  const conflict = await acceptProposal(sessionId, messageId);
  expect(conflict.status).toBe(409);
  expect((conflict.body as Record<string, unknown>).code).toBe('TUTORIAL_CHAPTER_USER_EDITED');
  // 占位修订 + 手工修订，冲突提案不得追加修订且认领被回退。
  await expectRevisionCount(advanced.documentId!, 2);
  const messagesAfter = (await readSnapshot(sessionId)).body as {
    messages: { card: unknown; id: string }[];
  };
  expect(messagesAfter.messages.find((message) => message.id === messageId)?.card).toMatchObject({
    state: 'pending',
  });

  const diff = await callApi(
    'POST',
    `/tutorials/${sessionId}/compose/chapters/${advanced.id}/accept-diff`,
    { content: '# 用户确认的 advanced 内容' },
  );
  expect(diff.status).toBe(200);
  expect((diff.body as Record<string, unknown>).revisionNumber).toBe(3);
  await expect(readDocumentText(advanced.documentId!)).resolves.toBe('# 用户确认的 advanced 内容');
});

test('所有者隔离：他人会话与对话不可访问', async () => {
  const foreignOwnerId = randomUUID();
  await database
    .insertInto('users')
    .values({ display_name: '外部用户', id: foreignOwnerId, timezone: 'Asia/Shanghai' })
    .executeTakeFirstOrThrow();
  const foreignSessionId = randomUUID();
  await sql`INSERT INTO tutorial_sessions (id, owner_id, topic, audience, level, depth, status)
    VALUES (${foreignSessionId}, ${foreignOwnerId}, '他人教程', 'a', 10, 'standard', 'draft_scope')`.execute(
    database,
  );
  await expect(tutorialService.graph(foreignSessionId)).rejects.toThrow();
  const foreignSnapshot = await readSnapshot(foreignSessionId);
  expect(foreignSnapshot.status).toBe(404);
});

test('新提案 pending 时接受旧提案：旧意图生效且同类新提案置 superseded', async () => {
  const sessionId = await createDraft('提案替代');
  nextComposeReply = proposalReply('提案一', 'scope', scopePayload);
  const oldProposal = await sendAndRead(sessionId, '旧范围提案');
  nextComposeReply = proposalReply('提案二', 'scope', {
    ...scopePayload,
    topic: 'Kysely 入门（更新版）',
  });
  const newProposal = await sendAndRead(sessionId, '新范围提案');

  const accept = await acceptProposal(sessionId, oldProposal.agentMessageId);
  expect(accept.status).toBe(200);
  expect((await tutorialService.detail(sessionId)).scope.topic).toBe('Kysely 入门（改）');
  const superseded = await database
    .selectFrom('tutorial_messages')
    .select('proposal_status')
    .where('id', '=', newProposal.agentMessageId)
    .executeTakeFirstOrThrow();
  expect(superseded.proposal_status).toBe('superseded');
});
