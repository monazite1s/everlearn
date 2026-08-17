/** @fileoverview 在真实 PostgreSQL 中验证内部清理触发端点的密钥与统计语义。 */

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { DocumentsTestEnvironment } from '../../tests/documents-integration.support';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(
  `documents_purge_api_${process.pid}`,
  databaseUrl ?? '',
);
const PURGE_SECRET = 'spec-purge-secret';
process.env.PURGE_TRIGGER_SECRET = PURGE_SECRET;

/** 用于写入一个已到期的已删文档并返回其知识库。 */
async function seedExpiredDocument(): Promise<string> {
  const knowledgeBase = '60000000-0000-4000-8000-000000000001';
  await environment.insertKnowledgeBases([{ id: knowledgeBase, name: '已删库' }]);
  const documentId = '61000000-0000-4000-8000-000000000001';
  await environment.insertDocuments([
    { id: documentId, knowledgeBaseId: knowledgeBase, position: 0, title: '到期文档' },
  ]);
  const expiredAt = new Date('2026-01-01T00:00:00Z');
  await environment
    .getDatabase()
    .updateTable('documents')
    .set({ deleted_at: expiredAt, deleted_parent_id: null, deleted_position: 0, version: 2 })
    .where('id', '=', documentId)
    .execute();
  await environment
    .getDatabase()
    .updateTable('knowledge_bases')
    .set({ deleted_at: expiredAt, version: 2 })
    .where('id', '=', knowledgeBase)
    .execute();
  return knowledgeBase;
}

/** 用于仅在配置 PostgreSQL 与触发密钥时注册场景。 */
function definePurgeTriggerTests(): void {
  beforeAll(() => environment.prepareApplication(), 30_000);
  beforeEach(() => environment.resetFixtures());
  afterAll(() => environment.releaseApplication());

  test('rejects calls without the shared secret', async () => {
    const response = await request(environment.getHttpServer())
      .post('/api/v1/internal/trash-purge')
      .send({});
    expect(response.status).toBe(401);
  });

  test('purges expired entries and returns closed stats', async () => {
    await seedExpiredDocument();
    const response = await request(environment.getHttpServer())
      .post('/api/v1/internal/trash-purge')
      .set('x-purge-secret', PURGE_SECRET)
      .send({});
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      purgedDocuments: 1,
      purgedInboxItems: 0,
      purgedKnowledgeBases: 1,
    });
  });
}

describe.skipIf(databaseUrl === undefined)('Internal trash purge trigger', definePurgeTriggerTests);
