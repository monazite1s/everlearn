/** @fileoverview 在真实 PostgreSQL 中验证移动幂等重放与并发序列化。 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import type { DocumentDetail } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import {
  DocumentsTestEnvironment,
  type DocumentFixture,
} from '../../tests/documents-integration.support';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(
  `documents_move_idem_${process.pid}`,
  databaseUrl ?? '',
);

/** 用于为知识库夹具生成确定的有效 UUID。 */
function knowledgeBaseId(sequence: number): string {
  return `c0000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于为文档夹具生成确定的有效 UUID。 */
function documentId(sequence: number): string {
  return `e0000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于发送带指定幂等键的移动请求。 */
function sendMove(id: string, body: object, key: string): Promise<request.Response> {
  return request(environment.getHttpServer())
    .post(`/api/v1/documents/${id}/move`)
    .set('Idempotency-Key', key)
    .send(body);
}

/** 用于返回幂等记录数量以验证只保存首次响应。 */
async function countIdempotencyRecords(): Promise<number> {
  const result = await environment
    .getDatabase()
    .selectFrom('idempotency_records')
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

/** 用于承载两层子树夹具的节点标识。 */
interface MoveFixtureIds {
  readonly child: string;
  readonly moved: string;
  readonly root: string;
  readonly target: string;
}

/** 用于写入一棵两层子树夹具并返回关键节点标识。 */
async function insertMoveFixtures(): Promise<MoveFixtureIds> {
  const root = documentId(1);
  const target = documentId(2);
  const moved = documentId(3);
  const child = documentId(4);
  const fixtures: readonly DocumentFixture[] = [
    { id: root, knowledgeBaseId: knowledgeBaseId(1), position: 0, title: '根' },
    { id: target, knowledgeBaseId: knowledgeBaseId(1), position: 1024, title: '目标父' },
    {
      id: moved,
      childOf: root,
      knowledgeBaseId: knowledgeBaseId(1),
      position: 0,
      title: '移动节点',
    },
    {
      id: child,
      childOf: moved,
      knowledgeBaseId: knowledgeBaseId(1),
      path: `/${root}/${moved}/${child}`,
      position: 0,
      title: '后代',
    },
  ];
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '主库' }]);
  await environment.insertDocuments(fixtures);
  return { child, moved, root, target };
}

/** 用于验证相同幂等键重放首次响应原文且不重复移动。 */
async function replaysFirstResponseForSameKey(): Promise<void> {
  const { child, moved, target } = await insertMoveFixtures();
  const first = await sendMove(moved, { targetParentId: target, version: 1 }, 'replay-key');
  expect(first.status).toBe(200);
  const rename = await request(environment.getHttpServer())
    .patch(`/api/v1/documents/${moved}`)
    .send({ title: '重命名后', version: 2 });
  expect(rename.status).toBe(200);
  const replay = await sendMove(moved, { targetParentId: target, version: 1 }, 'replay-key');
  expect(replay.status).toBe(200);
  expect(replay.text).toBe(first.text);
  expect(environment.parseBody<DocumentDetail>(replay)).toMatchObject({ version: 2 });
  const rows = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['title', 'version'])
    .where('id', 'in', [moved, child])
    .orderBy('id')
    .execute();
  expect(rows).toEqual([
    { title: '重命名后', version: 3 },
    { title: '后代', version: 1 },
  ]);
  expect(await countIdempotencyRecords()).toBe(1);
}

/** 用于验证并发同键请求由 advisory lock 串行化为同一首次响应。 */
async function serializesConcurrentSameKeyReplays(): Promise<void> {
  const { moved, target } = await insertMoveFixtures();
  const [first, concurrent] = await Promise.all([
    sendMove(moved, { targetParentId: target, version: 1 }, 'concurrent-key'),
    sendMove(moved, { targetParentId: target, version: 1 }, 'concurrent-key'),
  ]);
  expect(first.status).toBe(200);
  expect(concurrent.status).toBe(200);
  expect(concurrent.text).toBe(first.text);
  const row = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['parent_id', 'version'])
    .where('id', '=', moved)
    .executeTakeFirstOrThrow();
  expect(row).toEqual({ parent_id: target, version: 2 });
  expect(await countIdempotencyRecords()).toBe(1);
}

/** 用于验证不同请求复用同一幂等键返回公开冲突。 */
async function rejectsKeyReuseForDifferentRequest(): Promise<void> {
  const { moved, target } = await insertMoveFixtures();
  const first = await sendMove(moved, { targetParentId: target, version: 1 }, 'reused-key');
  expect(first.status).toBe(200);
  const conflict = await sendMove(moved, { version: 1 }, 'reused-key');
  environment.expectApiError(conflict, 409, 'IDEMPOTENCY_CONFLICT', '幂等键已用于另一个请求。');
  const row = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['parent_id'])
    .where('id', '=', moved)
    .executeTakeFirstOrThrow();
  expect(row.parent_id).toBe(target);
}

/** 用于验证缺失或非法幂等键在进入服务前被拒绝。 */
async function rejectsMissingOrInvalidKeys(): Promise<void> {
  const { moved } = await insertMoveFixtures();
  const missing = await request(environment.getHttpServer())
    .post(`/api/v1/documents/${moved}/move`)
    .send({ version: 1 });
  environment.expectApiError(missing, 400, 'BAD_REQUEST', '请求格式或参数无效。');
  const invalid = await sendMove(moved, { version: 1 }, 'move key with spaces');
  environment.expectApiError(invalid, 400, 'BAD_REQUEST', '请求格式或参数无效。');
  const tooLong = await sendMove(moved, { version: 1 }, 'x'.repeat(201));
  environment.expectApiError(tooLong, 400, 'BAD_REQUEST', '请求格式或参数无效。');
  expect(await countIdempotencyRecords()).toBe(0);
  const row = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['parent_id', 'version'])
    .where('id', '=', moved)
    .executeTakeFirstOrThrow();
  expect(row).toEqual({ parent_id: documentId(1), version: 1 });
}

/** 用于写入第二个可独立移动的两层节点并返回其标识。 */
async function insertSecondMovableNode(): Promise<readonly [string, string]> {
  const secondMoved = documentId(5);
  const secondChild = documentId(6);
  await environment.insertDocuments([
    {
      id: secondMoved,
      childOf: documentId(1),
      knowledgeBaseId: knowledgeBaseId(1),
      position: 1024,
      title: '第二移动节点',
    },
    {
      id: secondChild,
      childOf: secondMoved,
      knowledgeBaseId: knowledgeBaseId(1),
      path: `/${documentId(1)}/${secondMoved}/${secondChild}`,
      position: 0,
      title: '第二后代',
    },
  ]);
  return [secondMoved, secondChild];
}

/** 用于验证同库并发移动不同节点得到互不冲突的稳定落位。 */
async function serializesConcurrentMovesOfDifferentNodes(): Promise<void> {
  const { moved: firstMoved, target } = await insertMoveFixtures();
  const [secondMoved, secondChild] = await insertSecondMovableNode();
  const [first, second] = await Promise.all([
    sendMove(firstMoved, { targetParentId: target, version: 1 }, 'concurrent-a'),
    sendMove(secondMoved, { version: 1 }, 'concurrent-b'),
  ]);
  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  const rows = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['id', 'parent_id', 'path', 'position', 'version'])
    .where('id', 'in', [firstMoved, documentId(4), secondMoved, secondChild])
    .orderBy('id')
    .execute();
  expect(rows).toEqual([
    {
      id: firstMoved,
      parent_id: target,
      path: `/${target}/${firstMoved}`,
      position: '0',
      version: 2,
    },
    {
      id: documentId(4),
      parent_id: firstMoved,
      path: `/${target}/${firstMoved}/${documentId(4)}`,
      position: '0',
      version: 1,
    },
    { id: secondMoved, parent_id: null, path: `/${secondMoved}`, position: '2048', version: 2 },
    {
      id: secondChild,
      parent_id: secondMoved,
      path: `/${secondMoved}/${secondChild}`,
      position: '0',
      version: 1,
    },
  ]);
  expect(await countIdempotencyRecords()).toBe(2);
}

/** 用于仅在配置 PostgreSQL 时注册真实数据库场景。 */
function defineMoveIdempotencyTests(): void {
  beforeAll(() => environment.prepareApplication(), 30_000);
  beforeEach(() => environment.resetFixtures());
  afterAll(() => environment.releaseApplication());
  test('replays first response for the same idempotency key', replaysFirstResponseForSameKey);
  test('serializes concurrent same-key requests to one result', serializesConcurrentSameKeyReplays);
  test('rejects key reuse for a different request', rejectsKeyReuseForDifferentRequest);
  test('rejects missing or invalid idempotency keys', rejectsMissingOrInvalidKeys);
  test('serializes concurrent moves of different nodes', serializesConcurrentMovesOfDifferentNodes);
}

describe.skipIf(databaseUrl === undefined)(
  'Document move idempotency HTTP integration',
  defineMoveIdempotencyTests,
);
