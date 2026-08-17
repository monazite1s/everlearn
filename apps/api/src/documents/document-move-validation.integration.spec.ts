/** @fileoverview 在真实 PostgreSQL 中验证文档移动的非法目标与请求被完整拒绝。 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { DocumentsTestEnvironment, otherUserId } from '../../tests/documents-integration.support';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(
  `documents_move_val_${process.pid}`,
  databaseUrl ?? '',
);

/** 用于为知识库夹具生成确定的有效 UUID。 */
function knowledgeBaseId(sequence: number): string {
  return `f0000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于为文档夹具生成确定的有效 UUID。 */
function documentId(sequence: number): string {
  return `01000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于发送带固定幂等键的移动请求。 */
function sendMove(id: string, body: object, key = 'move-key'): Promise<request.Response> {
  return request(environment.getHttpServer())
    .post(`/api/v1/documents/${id}/move`)
    .set('Idempotency-Key', key)
    .send(body);
}

/** 用于读取全部树字段以断言失败场景未部分提交。 */
function readTreeFacts(): Promise<readonly object[]> {
  return environment
    .getDatabase()
    .selectFrom('documents')
    .select(['id', 'parent_id', 'path', 'position', 'title', 'version'])
    .orderBy('id')
    .execute();
}

/** 用于写入一棵三层子树夹具并返回根与关键节点标识。 */
async function insertSubtreeFixtures(): Promise<{
  child: string;
  grandchild: string;
  root: string;
  subtreeRoot: string;
}> {
  const root = documentId(1);
  const subtreeRoot = documentId(2);
  const child = documentId(3);
  const grandchild = documentId(4);
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '主库' }]);
  await environment.insertDocuments([
    { id: root, knowledgeBaseId: knowledgeBaseId(1), position: 0, title: '根' },
    {
      id: subtreeRoot,
      childOf: root,
      knowledgeBaseId: knowledgeBaseId(1),
      position: 0,
      title: '子树根',
    },
    {
      id: child,
      childOf: subtreeRoot,
      knowledgeBaseId: knowledgeBaseId(1),
      path: `/${root}/${subtreeRoot}/${child}`,
      position: 0,
      title: '子树子',
    },
    {
      id: grandchild,
      childOf: child,
      knowledgeBaseId: knowledgeBaseId(1),
      path: `/${root}/${subtreeRoot}/${child}/${grandchild}`,
      position: 1024,
      title: '子树孙',
    },
  ]);
  return { child, grandchild, root, subtreeRoot };
}

/** 用于验证自身与后代目标及自身锚点属于客户端逻辑错误且不产生写入。 */
async function rejectsSelfAndDescendantTargets(): Promise<void> {
  const { child, grandchild, subtreeRoot } = await insertSubtreeFixtures();
  const facts = await readTreeFacts();
  for (const target of [subtreeRoot, child, grandchild]) {
    const response = await sendMove(subtreeRoot, { targetParentId: target, version: 1 });
    const body = environment.expectApiError(
      response,
      400,
      'VALIDATION_FAILED',
      '请求参数校验失败。',
    );
    expect(body).toMatchObject({
      details: { fields: [{ field: 'targetParentId', rules: ['notSelfOrDescendant'] }] },
    });
  }
  for (const anchor of ['beforeId', 'afterId'] as const) {
    const response = await sendMove(subtreeRoot, { [anchor]: subtreeRoot, version: 1 });
    const body = environment.expectApiError(
      response,
      400,
      'VALIDATION_FAILED',
      '请求参数校验失败。',
    );
    expect(body).toMatchObject({
      details: { fields: [{ field: anchor, rules: ['notMovedDocument'] }] },
    });
  }
  expect(await readTreeFacts()).toEqual(facts);
}

/** 用于写入跨库、他人、软删除目标与错位锚点夹具并返回移动节点。 */
async function insertInaccessibleTargetFixtures(): Promise<string> {
  await environment.insertOtherUser();
  await environment.insertKnowledgeBases([
    { id: knowledgeBaseId(1), name: '主库' },
    { id: knowledgeBaseId(2), name: '外部库' },
    { id: knowledgeBaseId(3), name: '他人库', ownerId: otherUserId },
    { id: knowledgeBaseId(4), name: '已删库', deletedAt: new Date() },
  ]);
  const root = documentId(1);
  await environment.insertDocuments([
    { id: root, knowledgeBaseId: knowledgeBaseId(1), position: 0, title: '移动节点' },
    { id: documentId(3), knowledgeBaseId: knowledgeBaseId(2), position: 0, title: '跨库父' },
    {
      id: documentId(4),
      knowledgeBaseId: knowledgeBaseId(3),
      ownerId: otherUserId,
      position: 0,
      title: '他人父',
    },
    {
      id: documentId(5),
      knowledgeBaseId: knowledgeBaseId(1),
      position: 0,
      title: '已删父',
      deleted: true,
    },
    { id: documentId(6), knowledgeBaseId: knowledgeBaseId(4), position: 0, title: '已删库父' },
    { id: documentId(8), knowledgeBaseId: knowledgeBaseId(1), position: 1024, title: '另一根' },
    {
      id: documentId(7),
      childOf: documentId(8),
      knowledgeBaseId: knowledgeBaseId(1),
      position: 0,
      title: '锚点在别父',
    },
  ]);
  return root;
}

/** 用于验证不可探测目标与失效锚点统一 404 且数据库不变。 */
async function rejectsInaccessibleTargets(): Promise<void> {
  const root = await insertInaccessibleTargetFixtures();
  const facts = await readTreeFacts();
  const invalidBodies: readonly object[] = [
    { targetParentId: documentId(3), version: 1 },
    { targetParentId: documentId(4), version: 1 },
    { targetParentId: documentId(5), version: 1 },
    { targetParentId: documentId(6), version: 1 },
    { targetParentId: documentId(99), version: 1 },
    { beforeId: documentId(7), version: 1 },
    { beforeId: documentId(99), version: 1 },
    { afterId: documentId(7), version: 1 },
  ];
  for (const body of invalidBodies) {
    const response = await sendMove(root, body);
    const errorBody = environment.expectApiError(
      response,
      404,
      'NOT_FOUND',
      '请求的资源不存在或不可访问。',
    );
    expect(Object.keys(errorBody).sort()).toEqual(['code', 'message', 'requestId']);
  }
  expect(await readTreeFacts()).toEqual(facts);
}

/** 用于验证版本冲突不产生任何部分提交。 */
async function rejectsVersionConflictWithoutWrites(): Promise<void> {
  const { root, subtreeRoot } = await insertSubtreeFixtures();
  const facts = await readTreeFacts();
  const response = await sendMove(subtreeRoot, { targetParentId: root, version: 2 });
  environment.expectApiError(
    response,
    409,
    'VERSION_CONFLICT',
    '资源已被其他操作更新，请刷新后重试。',
  );
  expect(await readTreeFacts()).toEqual(facts);
}

/** 用于验证移动请求的非法正文与媒体类型被拒绝。 */
async function rejectsInvalidMoveBodies(): Promise<void> {
  const { subtreeRoot } = await insertSubtreeFixtures();
  const invalidBodies: readonly object[] = [
    {},
    { version: 0 },
    { version: '1' },
    { version: 1.5 },
    { beforeId: 'not-a-uuid', version: 1 },
    { afterId: documentId(3), beforeId: documentId(4), version: 1 },
    { targetParentId: 'not-a-uuid', version: 1 },
    { position: 5, version: 1 },
    { path: '/custom', version: 1 },
    { ownerId: otherUserId, version: 1 },
  ];
  for (const body of invalidBodies) {
    const response = await sendMove(subtreeRoot, body);
    environment.expectApiError(response, 400, 'VALIDATION_FAILED', '请求参数校验失败。');
  }
  const nonJson = await request(environment.getHttpServer())
    .post(`/api/v1/documents/${subtreeRoot}/move`)
    .set('Content-Type', 'text/plain')
    .set('Idempotency-Key', 'move-key')
    .send('version=1');
  environment.expectApiError(
    nonJson,
    415,
    'UNSUPPORTED_MEDIA_TYPE',
    '请求正文必须使用 application/json。',
  );
}

/** 用于仅在配置 PostgreSQL 时注册真实数据库 HTTP 场景。 */
function defineDocumentMoveValidationTests(): void {
  beforeAll(() => environment.prepareApplication(), 30_000);
  beforeEach(() => environment.resetFixtures());
  afterAll(() => environment.releaseApplication());
  test('rejects self and descendant targets without writes', rejectsSelfAndDescendantTargets);
  test('rejects inaccessible targets and anchors', rejectsInaccessibleTargets);
  test('rejects version conflict without partial commit', rejectsVersionConflictWithoutWrites);
  test('rejects invalid move bodies and media types', rejectsInvalidMoveBodies);
}

describe.skipIf(databaseUrl === undefined)(
  'Document move validation HTTP integration',
  defineDocumentMoveValidationTests,
);
