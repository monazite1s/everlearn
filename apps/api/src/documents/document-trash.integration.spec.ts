/** @fileoverview 在隔离的真实 PostgreSQL Schema 中验证文档子树删除与恢复。 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import type { DocumentDetail } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import { DocumentsTestEnvironment, otherUserId } from '../../tests/documents-integration.support';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(
  `documents_trash_${process.pid}`,
  databaseUrl ?? '',
);

/** 用于为知识库与文档夹具生成确定的有效 UUID。 */
function fixedId(kind: string, sequence: number): string {
  return `${kind}0000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于读取单个文档的全部生命周期事实列。 */
function readDocument(id: string) {
  return environment
    .getDatabase()
    .selectFrom('documents')
    .select([
      'id',
      'parent_id',
      'path',
      'position',
      'version',
      'deleted_at',
      'deleted_parent_id',
      'deleted_position',
    ])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
}

/** 用于通过 HTTP 创建根或子文档并返回详情。 */
async function createDocument(knowledgeBase: string, title: string, parentId?: string) {
  const response = await request(environment.getHttpServer())
    .post(`/api/v1/knowledge-bases/${knowledgeBase}/documents`)
    .send({ ...(parentId === undefined ? {} : { parentId }), title });
  expect(response.status).toBe(201);
  return environment.parseBody<DocumentDetail>(response);
}

/** 用于创建带两层子树的测试知识库并返回文档详情。 */
async function createSubtree(): Promise<{
  child: DocumentDetail;
  grandchild: DocumentDetail;
  knowledgeBase: string;
  root: DocumentDetail;
}> {
  const knowledgeBase = fixedId('6', 1);
  await environment.insertKnowledgeBases([{ id: knowledgeBase, name: '主库' }]);
  const root = await createDocument(knowledgeBase, '根');
  const child = await createDocument(knowledgeBase, '子', root.id);
  const grandchild = await createDocument(knowledgeBase, '孙', child.id);
  return { child, grandchild, knowledgeBase, root };
}

/** 用于提交删除并返回完整响应。 */
function sendDelete(id: string, version: number) {
  return request(environment.getHttpServer()).delete(`/api/v1/documents/${id}`).send({ version });
}

/** 用于提交带幂等键的恢复请求。 */
function sendRestore(id: string, version: number, idempotencyKey: string) {
  return request(environment.getHttpServer())
    .post(`/api/v1/documents/${id}/restore`)
    .set('Idempotency-Key', idempotencyKey)
    .send({ version });
}

/** 用于验证知识库后删除时删除重放统一 404 且不再触碰子树。 */
async function stopsDeleteReplayAfterKnowledgeBaseDeletion(): Promise<void> {
  const { child, knowledgeBase, root } = await createSubtree();
  const first = await sendDelete(root.id, root.version);
  expect(first.status).toBe(204);
  const removed = await request(environment.getHttpServer())
    .delete(`/api/v1/knowledge-bases/${knowledgeBase}`)
    .send({ version: 1 });
  expect(removed.status).toBe(204);
  const replay = await sendDelete(root.id, root.version);
  const errorBody = environment.expectApiError(
    replay,
    404,
    'NOT_FOUND',
    '请求的资源不存在或不可访问。',
  );
  expect(Object.keys(errorBody).sort()).toEqual(['code', 'message', 'requestId']);
  const rootRow = await readDocument(root.id);
  const childRow = await readDocument(child.id);
  expect(rootRow.deleted_at).not.toBeNull();
  expect(childRow.deleted_at).not.toBeNull();
}

/** 用于验证子树删除保留原父级、位置与路径并统一标记删除。 */
async function deletesEntireSubtreeAtomically(): Promise<void> {
  const { child, grandchild, knowledgeBase, root } = await createSubtree();
  const sibling = await createDocument(knowledgeBase, '同级根');
  const response = await sendDelete(root.id, root.version);
  expect(response.status).toBe(204);
  expect(response.text).toBe('');
  for (const document of [root, child, grandchild]) {
    const row = await readDocument(document.id);
    expect(row.deleted_at).not.toBeNull();
    expect(row.deleted_parent_id).toBe(row.parent_id);
    expect(row.deleted_position).toBe(row.position);
    expect(row.version).toBe(document.version + 1);
  }
  const rootRow = await readDocument(root.id);
  const childRow = await readDocument(child.id);
  expect(rootRow.parent_id).toBeNull();
  expect(rootRow.path).toBe(`/${root.id}`);
  expect(childRow.parent_id).toBe(root.id);
  expect(childRow.path).toBe(`/${root.id}/${child.id}`);
  expect((await readDocument(sibling.id)).deleted_at).toBeNull();
  for (const id of [root.id, child.id, grandchild.id]) {
    const read = await request(environment.getHttpServer()).get(`/api/v1/documents/${id}`);
    expect(read.status).toBe(404);
  }
}

/** 用于验证重复删除请求按版本关系稳定重放且无额外副作用。 */
async function replaysDeletesWithoutSideEffects(): Promise<void> {
  const { root } = await createSubtree();
  const first = await sendDelete(root.id, root.version);
  expect(first.status).toBe(204);
  const afterDelete = await readDocument(root.id);
  const replay = await sendDelete(root.id, root.version);
  expect(replay.status).toBe(204);
  expect(await readDocument(root.id)).toEqual(afterDelete);
  const wrongVersion = await sendDelete(root.id, afterDelete.version);
  environment.expectApiError(
    wrongVersion,
    409,
    'VERSION_CONFLICT',
    '资源已被其他操作更新，请刷新后重试。',
  );
  expect(await readDocument(root.id)).toEqual(afterDelete);
}

/** 用于验证过期或不可探测删除目标被拒绝且数据库事实不变。 */
async function rejectsUnsafeDeletes(): Promise<void> {
  const { root } = await createSubtree();
  const stale = await sendDelete(root.id, root.version + 1);
  environment.expectApiError(
    stale,
    409,
    'VERSION_CONFLICT',
    '资源已被其他操作更新，请刷新后重试。',
  );
  expect((await readDocument(root.id)).deleted_at).toBeNull();
  await environment.insertOtherUser();
  const foreignKnowledgeBase = fixedId('6', 2);
  await environment.insertKnowledgeBases([
    { id: foreignKnowledgeBase, name: '他人库', ownerId: otherUserId },
  ]);
  const foreignDocument = {
    id: fixedId('7', 9),
    knowledgeBaseId: foreignKnowledgeBase,
    ownerId: otherUserId,
    position: 0,
  };
  await environment.insertDocuments([foreignDocument]);
  const foreign = await sendDelete(foreignDocument.id, 1);
  environment.expectApiError(foreign, 404, 'NOT_FOUND', '请求的资源不存在或不可访问。');
  const missing = await sendDelete(fixedId('7', 99), 1);
  environment.expectApiError(missing, 404, 'NOT_FOUND', '请求的资源不存在或不可访问。');
  expect((await readDocument(root.id)).deleted_at).toBeNull();
}

/** 用于验证恢复把完整子树放回原父级、原位置与原路径。 */
async function restoresEntireSubtreeToOriginalPlacement(): Promise<void> {
  const { child, grandchild, root } = await createSubtree();
  const beforeDelete = {
    child: await readDocument(child.id),
    grandchild: await readDocument(grandchild.id),
  };
  await sendDelete(root.id, root.version);
  const deletedRoot = await readDocument(root.id);
  const response = await sendRestore(root.id, deletedRoot.version, 'restore-original-1');
  expect(response.status).toBe(200);
  const detail = environment.parseBody<DocumentDetail>(response);
  expect(Object.keys(detail).sort()).toEqual([
    'childCount',
    'id',
    'knowledgeBaseId',
    'parentId',
    'title',
    'updatedAt',
    'version',
  ]);
  expect(detail).toMatchObject({
    childCount: 1,
    id: root.id,
    parentId: null,
    version: deletedRoot.version + 1,
  });
  expect((await readDocument(root.id)).deleted_at).toBeNull();
  const restoredChild = await readDocument(child.id);
  const restoredGrandchild = await readDocument(grandchild.id);
  expect(restoredChild.parent_id).toBe(beforeDelete.child.parent_id);
  expect(restoredChild.position).toBe(beforeDelete.child.position);
  expect(restoredChild.path).toBe(beforeDelete.child.path);
  expect(restoredChild.deleted_at).toBeNull();
  expect(restoredGrandchild.deleted_at).toBeNull();
  expect(restoredGrandchild.path).toBe(beforeDelete.grandchild.path);
  const read = await request(environment.getHttpServer()).get(`/api/v1/documents/${child.id}`);
  expect(read.status).toBe(200);
}

/** 用于验证原父级仍删除时恢复目标连同后代落到知识库根部末尾。 */
async function restoresOrphanSubtreeToKnowledgeBaseRoot(): Promise<void> {
  const { child, grandchild, root } = await createSubtree();
  const greatGrandchild = await createDocument(root.knowledgeBaseId, '曾孙', grandchild.id);
  await createDocument(root.knowledgeBaseId, '另一根');
  await sendDelete(child.id, child.version);
  const deletedGrandchild = await readDocument(grandchild.id);
  const response = await sendRestore(grandchild.id, deletedGrandchild.version, 'restore-orphan-1');
  expect(response.status).toBe(200);
  const detail = environment.parseBody<DocumentDetail>(response);
  expect(detail.parentId).toBeNull();
  const restored = await readDocument(grandchild.id);
  expect(restored.path).toBe(`/${grandchild.id}`);
  expect(restored.position).toBe('2048');
  expect(restored.deleted_at).toBeNull();
  expect((await readDocument(greatGrandchild.id)).path).toBe(
    `/${grandchild.id}/${greatGrandchild.id}`,
  );
  expect((await readDocument(greatGrandchild.id)).deleted_at).toBeNull();
  expect((await readDocument(child.id)).deleted_at).not.toBeNull();
  expect((await readDocument(root.id)).deleted_at).toBeNull();
}

/** 用于验证先删子树再删祖先时恢复祖先连带恢复全部前缀后代。 */
async function restoresPredeletedDescendantsWithAncestor(): Promise<void> {
  const { child, grandchild, root } = await createSubtree();
  await sendDelete(child.id, child.version);
  const childDeletedAt = (await readDocument(child.id)).deleted_at;
  const rootDeleted = await sendDelete(root.id, root.version);
  expect(rootDeleted.status).toBe(204);
  expect((await readDocument(child.id)).deleted_at?.toISOString()).toBe(
    childDeletedAt?.toISOString(),
  );
  const response = await sendRestore(
    root.id,
    (await readDocument(root.id)).version,
    'restore-predeleted-1',
  );
  expect(response.status).toBe(200);
  for (const document of [root, child, grandchild]) {
    expect((await readDocument(document.id)).deleted_at).toBeNull();
  }
  const childRow = await readDocument(child.id);
  const grandchildRow = await readDocument(grandchild.id);
  expect(childRow.parent_id).toBe(root.id);
  expect(grandchildRow.parent_id).toBe(child.id);
}

/** 用于验证知识库仍删除时拒绝单独恢复文档并指引先恢复知识库。 */
async function rejectsRestoreWhileKnowledgeBaseDeleted(): Promise<void> {
  const knowledgeBase = fixedId('6', 3);
  await environment.insertKnowledgeBases([
    { deletedAt: new Date('2026-08-15T00:00:00Z'), id: knowledgeBase, name: '已删库' },
  ]);
  const deletedDocument = {
    deleted: true,
    id: fixedId('7', 5),
    knowledgeBaseId: knowledgeBase,
    position: 0,
    title: '已删文档',
  };
  await environment.insertDocuments([deletedDocument]);
  const rejected = await sendRestore(deletedDocument.id, 1, 'restore-blocked-1');
  environment.expectApiError(
    rejected,
    409,
    'KNOWLEDGE_BASE_DELETED',
    '原知识库仍在回收站，请先恢复知识库。',
  );
  expect((await readDocument(deletedDocument.id)).deleted_at).not.toBeNull();
  const restoreKnowledgeBase = await request(environment.getHttpServer())
    .post(`/api/v1/knowledge-bases/${knowledgeBase}/restore`)
    .set('Idempotency-Key', 'restore-kb-1')
    .send({ version: 1 });
  expect(restoreKnowledgeBase.status).toBe(200);
  const restoredDocument = await sendRestore(deletedDocument.id, 1, 'restore-after-kb-1');
  expect(restoredDocument.status).toBe(200);
  expect((await readDocument(deletedDocument.id)).deleted_at).toBeNull();
}

/** 用于验证恢复幂等重放、并发串行化与冲突键拒绝。 */
async function restoresIdempotentlyUnderConcurrency(): Promise<void> {
  const { root } = await createSubtree();
  await sendDelete(root.id, root.version);
  const deletedVersion = (await readDocument(root.id)).version;
  const [first, concurrent] = await Promise.all([
    sendRestore(root.id, deletedVersion, 'restore-race-1'),
    sendRestore(root.id, deletedVersion, 'restore-race-1'),
  ]);
  expect(first.status).toBe(200);
  expect(concurrent.status).toBe(200);
  expect(concurrent.text).toBe(first.text);
  expect((await readDocument(root.id)).version).toBe(deletedVersion + 1);
  const records = await environment
    .getDatabase()
    .selectFrom('idempotency_records')
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  expect(Number(records.count)).toBe(1);
  const keyConflict = await sendRestore(root.id, deletedVersion + 1, 'restore-race-1');
  environment.expectApiError(keyConflict, 409, 'IDEMPOTENCY_CONFLICT', '幂等键已用于另一个请求。');
  const restoredVersion = (await readDocument(root.id)).version;
  await sendDelete(root.id, restoredVersion);
  const redeletedVersion = (await readDocument(root.id)).version;
  const outcomes = await Promise.allSettled([
    sendRestore(root.id, redeletedVersion, 'restore-race-2'),
    sendRestore(root.id, redeletedVersion, 'restore-race-3'),
  ]);
  const statuses = outcomes.map((outcome) =>
    outcome.status === 'fulfilled' ? outcome.value.status : -1,
  );
  expect(statuses.sort()).toEqual([200, 409]);
}

/** 用于验证恢复活跃文档、缺失键与过期版本被拒绝且不产生记录。 */
async function rejectsUnsafeRestores(): Promise<void> {
  const { root } = await createSubtree();
  const active = await sendRestore(root.id, root.version, 'restore-active-1');
  environment.expectApiError(active, 409, 'CONFLICT', '资源当前状态不允许此操作。');
  await sendDelete(root.id, root.version);
  const deletedVersion = (await readDocument(root.id)).version;
  const missingKey = await request(environment.getHttpServer())
    .post(`/api/v1/documents/${root.id}/restore`)
    .send({ version: deletedVersion });
  environment.expectApiError(missingKey, 400, 'BAD_REQUEST', '请求格式或参数无效。');
  const stale = await sendRestore(root.id, deletedVersion - 1, 'restore-stale-1');
  environment.expectApiError(
    stale,
    409,
    'VERSION_CONFLICT',
    '资源已被其他操作更新，请刷新后重试。',
  );
  const missing = await sendRestore(fixedId('7', 98), 1, 'restore-missing-1');
  environment.expectApiError(missing, 404, 'NOT_FOUND', '请求的资源不存在或不可访问。');
  const nonJson = await request(environment.getHttpServer())
    .delete(`/api/v1/documents/${root.id}`)
    .set('Content-Type', 'text/plain')
    .send('version=1');
  environment.expectApiError(
    nonJson,
    415,
    'UNSUPPORTED_MEDIA_TYPE',
    '请求正文必须使用 application/json。',
  );
  const records = await environment
    .getDatabase()
    .selectFrom('idempotency_records')
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  expect(Number(records.count)).toBe(0);
  expect((await readDocument(root.id)).deleted_at).not.toBeNull();
}

/** 用于仅在配置 PostgreSQL 时注册真实数据库 HTTP 场景。 */
function defineDocumentTrashIntegrationTests(): void {
  beforeAll(() => environment.prepareApplication(), 30_000);
  beforeEach(() => environment.resetFixtures());
  afterAll(() => environment.releaseApplication());
  test('deletes entire subtree atomically with saved placement', deletesEntireSubtreeAtomically);
  test('replays repeated deletes without side effects', replaysDeletesWithoutSideEffects);
  test(
    'stops delete replay with uniform 404 after knowledge-base deletion',
    stopsDeleteReplayAfterKnowledgeBaseDeletion,
  );
  test('rejects unsafe delete requests', rejectsUnsafeDeletes);
  test('restores entire subtree to original placement', restoresEntireSubtreeToOriginalPlacement);
  test('restores orphan subtree to knowledge-base root', restoresOrphanSubtreeToKnowledgeBaseRoot);
  test('restores predeleted descendants with ancestor', restoresPredeletedDescendantsWithAncestor);
  test('rejects restore while knowledge base is deleted', rejectsRestoreWhileKnowledgeBaseDeleted);
  test('restores idempotently under concurrency', restoresIdempotentlyUnderConcurrency);
  test('rejects unsafe restore requests', rejectsUnsafeRestores);
}

describe.skipIf(databaseUrl === undefined)(
  'Document trash HTTP integration',
  defineDocumentTrashIntegrationTests,
);
