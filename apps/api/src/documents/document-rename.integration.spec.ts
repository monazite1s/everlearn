/** @fileoverview 在隔离的真实 PostgreSQL Schema 中验证文档详情读取与按版本重命名。 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import type { DocumentDetail } from '@everlearn/contracts' with { 'resolution-mode': 'import' };

import {
  DocumentsTestEnvironment,
  documentDetailKeys,
  otherUserId,
} from '../../tests/documents-integration.support';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(
  `documents_rename_${process.pid}`,
  databaseUrl ?? '',
);

/** 用于为知识库夹具生成确定的有效 UUID。 */
function knowledgeBaseId(sequence: number): string {
  return `60000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于为文档夹具生成确定的有效 UUID。 */
function documentId(sequence: number): string {
  return `70000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于写入本地用户的普通知识库并可选标记软删除。 */
async function insertKnowledgeBase(id: string, deleted = false): Promise<void> {
  await environment.insertKnowledgeBases([
    { deletedAt: deleted ? new Date('2026-08-13T00:00:00Z') : null, id, name: `库 ${id}` },
  ]);
}

/** 用于写入其他用户与其知识库以验证所有权过滤。 */
async function insertOtherUserKnowledgeBase(): Promise<void> {
  await environment.insertOtherUser();
  await environment.insertKnowledgeBases([
    { id: knowledgeBaseId(2), name: '他人库', ownerId: otherUserId },
  ]);
}

/** 用于返回文档修订数量以验证重命名不产生修订。 */
async function countRevisions(document: string): Promise<number> {
  const result = await environment
    .getDatabase()
    .selectFrom('document_revisions')
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .where('document_id', '=', document)
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

/** 用于验证详情投影只统计活跃子节点且包含范围字段。 */
async function readsOwnActiveDocumentDetails(): Promise<void> {
  const root = documentId(1);
  await insertKnowledgeBase(knowledgeBaseId(1));
  await environment.insertDocuments([
    { id: root, knowledgeBaseId: knowledgeBaseId(1), position: 0, title: '可读根' },
    { id: documentId(2), childOf: root, knowledgeBaseId: knowledgeBaseId(1), position: 0 },
    { id: documentId(3), childOf: root, knowledgeBaseId: knowledgeBaseId(1), position: 1024 },
    {
      id: documentId(4),
      childOf: root,
      knowledgeBaseId: knowledgeBaseId(1),
      position: 2048,
      deleted: true,
    },
  ]);
  const rootResponse = await request(environment.getHttpServer()).get(`/api/v1/documents/${root}`);
  expect(rootResponse.status).toBe(200);
  const detail = environment.parseBody<DocumentDetail>(rootResponse);
  expect(Object.keys(detail).sort()).toEqual(documentDetailKeys);
  expect(detail).toMatchObject({
    childCount: 2,
    id: root,
    knowledgeBaseId: knowledgeBaseId(1),
    parentId: null,
    title: '可读根',
    version: 1,
  });
  const childResponse = await request(environment.getHttpServer()).get(
    `/api/v1/documents/${documentId(2)}`,
  );
  expect(environment.parseBody<DocumentDetail>(childResponse)).toMatchObject({ parentId: root });
}

/** 用于验证缺失、他人、已删文档与已删知识库统一不可探测。 */
async function hidesInaccessibleDocumentDetails(): Promise<void> {
  await insertOtherUserKnowledgeBase();
  await insertKnowledgeBase(knowledgeBaseId(1));
  await insertKnowledgeBase(knowledgeBaseId(3), true);
  await environment.insertDocuments([
    {
      id: documentId(1),
      knowledgeBaseId: knowledgeBaseId(1),
      position: 0,
      title: '已删文档',
      deleted: true,
    },
    {
      id: documentId(2),
      knowledgeBaseId: knowledgeBaseId(2),
      ownerId: otherUserId,
      position: 0,
      title: '他人机密',
    },
    { id: documentId(3), knowledgeBaseId: knowledgeBaseId(3), position: 0, title: '已删库机密' },
  ]);
  for (const id of [documentId(1), documentId(2), documentId(3), documentId(99)]) {
    const response = await request(environment.getHttpServer()).get(`/api/v1/documents/${id}`);
    const body = environment.expectApiError(
      response,
      404,
      'NOT_FOUND',
      '请求的资源不存在或不可访问。',
    );
    expect(Object.keys(body).sort()).toEqual(['code', 'message', 'requestId']);
    expect(response.text).not.toContain('他人机密');
    expect(response.text).not.toContain('已删库机密');
  }
}

/** 用于创建待重命名文档并返回其详情。 */
async function createRenameableDocument(): Promise<DocumentDetail> {
  const response = await request(environment.getHttpServer())
    .post(`/api/v1/knowledge-bases/${knowledgeBaseId(1)}/documents`)
    .send({ title: '原始标题' });
  expect(response.status).toBe(201);
  return environment.parseBody<DocumentDetail>(response);
}

/** 用于验证按版本重命名成功且不产生正文修订。 */
async function renamesDocumentByVersion(): Promise<void> {
  await insertKnowledgeBase(knowledgeBaseId(1));
  const created = await createRenameableDocument();
  expect(await countRevisions(created.id)).toBe(1);
  const renameResponse = await request(environment.getHttpServer())
    .patch(`/api/v1/documents/${created.id}`)
    .send({ title: '  新标题  ', version: 1 });
  expect(renameResponse.status).toBe(200);
  const renamed = environment.parseBody<DocumentDetail>(renameResponse);
  expect(Object.keys(renamed).sort()).toEqual(documentDetailKeys);
  expect(renamed).toMatchObject({ id: created.id, title: '新标题', version: 2 });
  expect(Date.parse(renamed.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.updatedAt));
  const row = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['title', 'version', 'path', 'position', 'parent_id', 'knowledge_base_id'])
    .where('id', '=', created.id)
    .executeTakeFirstOrThrow();
  expect(row).toMatchObject({
    knowledge_base_id: knowledgeBaseId(1),
    parent_id: null,
    path: `/${created.id}`,
    position: '0',
    title: '新标题',
    version: 2,
  });
  expect(await countRevisions(created.id)).toBe(1);
}

/** 用于验证版本冲突不改标题且不产生修订。 */
async function keepsTitleUnchangedOnVersionConflict(): Promise<void> {
  await insertKnowledgeBase(knowledgeBaseId(1));
  const created = await createRenameableDocument();
  const stale = await request(environment.getHttpServer())
    .patch(`/api/v1/documents/${created.id}`)
    .send({ title: '冲突标题', version: 2 });
  environment.expectApiError(
    stale,
    409,
    'VERSION_CONFLICT',
    '资源已被其他操作更新，请刷新后重试。',
  );
  const afterConflict = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['title', 'version'])
    .where('id', '=', created.id)
    .executeTakeFirstOrThrow();
  expect(afterConflict).toEqual({ title: '原始标题', version: 1 });
  expect(await countRevisions(created.id)).toBe(1);
}

/** 用于验证重命名正文校验与媒体类型边界。 */
async function rejectsInvalidRenameBodies(): Promise<void> {
  await insertKnowledgeBase(knowledgeBaseId(1));
  await environment.insertDocuments([
    { id: documentId(1), knowledgeBaseId: knowledgeBaseId(1), position: 0 },
  ]);
  const invalidBodies: readonly object[] = [
    {},
    { version: 1 },
    { title: ' \t\n ', version: 1 },
    { title: 'x'.repeat(201), version: 1 },
    { title: 'x', version: 0 },
    { title: 'x', version: 1.5 },
    { title: 'x', version: '1' },
    { title: 'x', version: 1, ownerId: otherUserId },
  ];
  for (const body of invalidBodies) {
    const response = await request(environment.getHttpServer())
      .patch(`/api/v1/documents/${documentId(1)}`)
      .send(body);
    environment.expectApiError(response, 400, 'VALIDATION_FAILED', '请求参数校验失败。');
  }
  const nonJson = await request(environment.getHttpServer())
    .patch(`/api/v1/documents/${documentId(1)}`)
    .set('Content-Type', 'text/plain')
    .send('title=not-json');
  environment.expectApiError(
    nonJson,
    415,
    'UNSUPPORTED_MEDIA_TYPE',
    '请求正文必须使用 application/json。',
  );
}

/** 用于验证不可访问目标的重命名统一 404。 */
async function rejectsInaccessibleRenameTargets(): Promise<void> {
  await insertOtherUserKnowledgeBase();
  await insertKnowledgeBase(knowledgeBaseId(1));
  await insertKnowledgeBase(knowledgeBaseId(3), true);
  await environment.insertDocuments([
    {
      id: documentId(1),
      knowledgeBaseId: knowledgeBaseId(1),
      position: 0,
      title: '已删文档',
      deleted: true,
    },
    {
      id: documentId(2),
      knowledgeBaseId: knowledgeBaseId(2),
      ownerId: otherUserId,
      position: 0,
      title: '他人机密',
    },
    { id: documentId(3), knowledgeBaseId: knowledgeBaseId(3), position: 0 },
  ]);
  for (const id of [documentId(1), documentId(2), documentId(3), documentId(99)]) {
    const response = await request(environment.getHttpServer())
      .patch(`/api/v1/documents/${id}`)
      .send({ title: '新标题', version: 1 });
    environment.expectApiError(response, 404, 'NOT_FOUND', '请求的资源不存在或不可访问。');
  }
}

/** 用于仅在配置 PostgreSQL 时注册真实数据库 HTTP 场景。 */
function defineDocumentRenameIntegrationTests(): void {
  beforeAll(() => environment.prepareApplication(), 30_000);
  beforeEach(() => environment.resetFixtures());
  afterAll(() => environment.releaseApplication());
  test('reads own active document details with active child counts', readsOwnActiveDocumentDetails);
  test('hides inaccessible document details without disclosure', hidesInaccessibleDocumentDetails);
  test('renames by version without creating revisions', renamesDocumentByVersion);
  test('keeps title unchanged on version conflict', keepsTitleUnchangedOnVersionConflict);
  test('rejects invalid rename bodies and media types', rejectsInvalidRenameBodies);
  test('rejects inaccessible rename targets', rejectsInaccessibleRenameTargets);
}

describe.skipIf(databaseUrl === undefined)(
  'Document detail and rename HTTP integration',
  defineDocumentRenameIntegrationTests,
);
