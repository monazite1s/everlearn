/** @fileoverview 在真实 PostgreSQL 中验证 Inbox 转换幂等重放、并发与唯一约束。 */

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import type { DocumentDetail } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import { DocumentsTestEnvironment } from '../../tests/documents-integration.support';
import { LOCAL_USER_ID } from '../identity/local-identity.constants';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(
  `inbox_convert_idem_${process.pid}`,
  databaseUrl ?? '',
);

/** 用于为知识库夹具生成确定的有效 UUID。 */
function knowledgeBaseId(): string {
  return 'a0000000-0000-4000-8000-000000000001';
}

/** 用于为 Inbox 夹具生成确定的有效 UUID。 */
function inboxId(sequence: number): string {
  return `90000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于发送带指定幂等键的转换请求。 */
function sendConvert(id: string, body: object, idempotencyKey?: string): Promise<request.Response> {
  const pending = request(environment.getHttpServer()).post(`/api/v1/inbox-items/${id}/convert`);
  if (idempotencyKey !== undefined) pending.set('Idempotency-Key', idempotencyKey);
  return pending.send(body);
}

/** 用于写入单个待处理文本记录并返回其标识。 */
async function insertPendingItem(sequence: number): Promise<string> {
  await environment
    .getDatabase()
    .insertInto('inbox_items')
    .values({
      content: `记录 ${sequence}`,
      id: inboxId(sequence),
      kind: 'text',
      owner_id: LOCAL_USER_ID,
      status: 'pending',
    })
    .execute();
  return inboxId(sequence);
}

/** 用于读取指定事实表行数以断言转换只发生一次。 */
async function tableCount(
  table: 'documents' | 'document_revisions' | 'idempotency_records',
): Promise<number> {
  const rows = await environment
    .getDatabase()
    .selectFrom(table)
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  return Number(rows.count);
}

/** 用于读取单条 Inbox 记录的终态投影。 */
async function readInboxRow(id: string) {
  return environment
    .getDatabase()
    .selectFrom('inbox_items')
    .select(['status', 'converted_document_id', 'content'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
}

/** 用于验证相同幂等键重放首次响应原文且不重复创建。 */
async function replaysFirstResponseForSameKey(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(), name: '主库' }]);
  const id = await insertPendingItem(1);
  const body = { knowledgeBaseId: knowledgeBaseId(), title: '转换标题' };
  const first = await sendConvert(id, body, 'replay-key');
  expect(first.status).toBe(201);
  const replay = await sendConvert(id, body, 'replay-key');
  expect(replay.status).toBe(201);
  expect(replay.text).toBe(first.text);
  expect(await tableCount('documents')).toBe(1);
  expect(await tableCount('document_revisions')).toBe(1);
  expect(await tableCount('idempotency_records')).toBe(1);
}

/** 用于验证不同请求复用同一幂等键返回公开冲突且不写入。 */
async function rejectsKeyReuseForDifferentRequest(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(), name: '主库' }]);
  const id = await insertPendingItem(1);
  const first = await sendConvert(
    id,
    { knowledgeBaseId: knowledgeBaseId(), title: '首次标题' },
    'reused-key',
  );
  expect(first.status).toBe(201);
  const conflict = await sendConvert(
    id,
    { knowledgeBaseId: knowledgeBaseId(), title: '另一标题' },
    'reused-key',
  );
  environment.expectApiError(conflict, 409, 'IDEMPOTENCY_CONFLICT', '幂等键已用于另一个请求。');
  expect(await tableCount('documents')).toBe(1);
  expect((await readInboxRow(id)).converted_document_id).toBe(
    environment.parseBody<DocumentDetail>(first).id,
  );
}

/** 用于验证缺失或非法幂等键在进入服务前被拒绝。 */
async function rejectsMissingOrInvalidKeys(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(), name: '主库' }]);
  const id = await insertPendingItem(1);
  const body = { knowledgeBaseId: knowledgeBaseId(), title: '标题' };
  const missing = await sendConvert(id, body);
  environment.expectApiError(missing, 400, 'BAD_REQUEST', '请求格式或参数无效。');
  for (const key of ['convert key', 'x'.repeat(201)]) {
    const response = await sendConvert(id, body, key);
    environment.expectApiError(response, 400, 'BAD_REQUEST', '请求格式或参数无效。');
  }
  expect(await tableCount('idempotency_records')).toBe(0);
  expect(await tableCount('documents')).toBe(0);
  expect((await readInboxRow(id)).status).toBe('pending');
}

/** 用于验证并发同键请求由 advisory lock 串行化为同一首次响应。 */
async function serializesConcurrentSameKeyConversions(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(), name: '主库' }]);
  const id = await insertPendingItem(1);
  const body = { knowledgeBaseId: knowledgeBaseId(), title: '并发标题' };
  const [first, concurrent] = await Promise.all([
    sendConvert(id, body, 'concurrent-key'),
    sendConvert(id, body, 'concurrent-key'),
  ]);
  expect(first.status).toBe(201);
  expect(concurrent.status).toBe(201);
  expect(concurrent.text).toBe(first.text);
  expect(await tableCount('documents')).toBe(1);
  expect(await tableCount('document_revisions')).toBe(1);
  expect(await tableCount('idempotency_records')).toBe(1);
}

/** 用于验证不同键并发转换同一记录恰有一个成功且另一个统一 404。 */
async function resolvesConcurrentDifferentKeysToOneWinner(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(), name: '主库' }]);
  const id = await insertPendingItem(1);
  const body = { knowledgeBaseId: knowledgeBaseId(), title: '竞争标题' };
  const [first, second] = await Promise.all([
    sendConvert(id, body, 'winner-key-a'),
    sendConvert(id, body, 'winner-key-b'),
  ]);
  const statuses = [first.status, second.status].sort();
  expect(statuses).toEqual([201, 404]);
  const winner = first.status === 201 ? first : second;
  const loser = first.status === 201 ? second : first;
  environment.expectApiError(loser, 404, 'NOT_FOUND', '请求的资源不存在或不可访问。');
  expect(await tableCount('documents')).toBe(1);
  expect(await tableCount('document_revisions')).toBe(1);
  expect((await readInboxRow(id)).converted_document_id).toBe(
    environment.parseBody<DocumentDetail>(winner).id,
  );
}

/** 用于验证数据库唯一约束兜底拒绝重复幂等键记录。 */
async function enforcesUniqueIdempotencyRecordConstraint(): Promise<void> {
  const database = environment.getDatabase();
  const row = {
    id: 'f0000000-0000-4000-8000-000000000001',
    idempotency_key: 'constraint-key',
    operation: 'inbox-item.convert',
    owner_id: LOCAL_USER_ID,
    request_hash: 'hash',
    response_json: { id: 'x' },
  };
  await database.insertInto('idempotency_records').values(row).execute();
  await expect(
    database
      .insertInto('idempotency_records')
      .values({ ...row, id: 'f0000000-0000-4000-8000-000000000002' })
      .execute(),
  ).rejects.toThrow();
}

/** 用于仅在配置 PostgreSQL 时注册真实数据库场景。 */
function defineConversionIdempotencyTests(): void {
  beforeAll(() => environment.prepareApplication(), 30_000);
  beforeEach(async () => {
    await environment.getDatabase().deleteFrom('inbox_items').execute();
    await environment.resetFixtures();
  });
  afterAll(() => environment.releaseApplication());
  test('replays first response for the same idempotency key', replaysFirstResponseForSameKey);
  test('rejects key reuse for a different request', rejectsKeyReuseForDifferentRequest);
  test('rejects missing or invalid idempotency keys', rejectsMissingOrInvalidKeys);
  test(
    'serializes concurrent same-key conversions to one document',
    serializesConcurrentSameKeyConversions,
  );
  test(
    'resolves concurrent different-key conversions to a single winner',
    resolvesConcurrentDifferentKeysToOneWinner,
  );
  test(
    'enforces the unique idempotency record constraint',
    enforcesUniqueIdempotencyRecordConstraint,
  );
}

describe.skipIf(databaseUrl === undefined)(
  'Inbox item conversion idempotency HTTP integration',
  defineConversionIdempotencyTests,
);
