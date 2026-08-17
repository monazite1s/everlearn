/** @fileoverview 在隔离的真实 PostgreSQL Schema 中验证修订恢复矩阵与历史完整性。 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import type { DocumentContentDetail, DocumentRevisionDetail } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import {
  DocumentsTestEnvironment,
  documentDetailKeys,
} from '../../tests/documents-integration.support';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(
  `documents_restore_${process.pid}`,
  databaseUrl ?? '',
);

const CONTENT_DETAIL_KEYS = ['contentJson', 'schemaVersion', ...documentDetailKeys].sort();

/** 用于为知识库夹具生成确定的有效 UUID。 */
function knowledgeBaseId(sequence: number): string {
  return `61000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于按序号生成合法 blockId。 */
function blockIdOf(sequence: number): string {
  return `87000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于构造带唯一 blockId 的单段落正文。 */
function contentOf(sequence: number, text: string) {
  return {
    content: [
      {
        attrs: { blockId: blockIdOf(sequence) },
        content: [{ text, type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  };
}

/** 用于创建待恢复文档并返回标识。 */
async function createDocument(title: string): Promise<{ id: string; version: number }> {
  const response = await request(environment.getHttpServer())
    .post(`/api/v1/knowledge-bases/${knowledgeBaseId(1)}/documents`)
    .send({ title });
  expect(response.status).toBe(201);
  const detail = environment.parseBody<{ id: string; version: number }>(response);
  return { id: detail.id, version: detail.version };
}

/** 用于提交一次正文保存请求。 */
function saveContent(id: string, body: object) {
  return request(environment.getHttpServer()).patch(`/api/v1/documents/${id}/content`).send(body);
}

/** 用于提交一次显式修订创建请求。 */
function postRevision(id: string, body: object) {
  return request(environment.getHttpServer()).post(`/api/v1/documents/${id}/revisions`).send(body);
}

/** 用于提交一次修订恢复请求。 */
function restoreRevision(id: string, revisionNumber: string, body: object) {
  return request(environment.getHttpServer())
    .post(`/api/v1/documents/${id}/revisions/${revisionNumber}/restore`)
    .send(body);
}

/** 用于读取按修订号排序的全部修订行。 */
async function revisionRows(id: string) {
  return environment
    .getDatabase()
    .selectFrom('document_revisions')
    .select(['content_json', 'revision_number', 'source', 'title'])
    .where('document_id', '=', id)
    .orderBy('revision_number', 'asc')
    .execute();
}

/** 用于构造三份修订历史（初始、快照 A、快照 B）供恢复矩阵复用。 */
async function seedRestoreHistory(): Promise<{ id: string; version: number }> {
  const created = await createDocument('原始标题');
  await saveContent(created.id, {
    contentJson: contentOf(10, '内容 A'),
    schemaVersion: 1,
    version: created.version,
  });
  await postRevision(created.id, {
    contentJson: contentOf(10, '内容 A'),
    schemaVersion: 1,
    version: created.version + 1,
  });
  await saveContent(created.id, {
    contentJson: contentOf(11, '内容 B'),
    schemaVersion: 1,
    title: '新标题 B',
    version: created.version + 1,
  });
  await postRevision(created.id, {
    contentJson: contentOf(11, '内容 B'),
    schemaVersion: 1,
    version: created.version + 2,
  });
  return { id: created.id, version: created.version + 2 };
}

/** 用于验证恢复产生 restore 修订、回写当前内容且不删除历史。 */
async function restoresRevisionKeepingHistory(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '恢复库' }]);
  const seeded = await seedRestoreHistory();
  const response = await restoreRevision(seeded.id, '2', { version: seeded.version });
  expect(response.status).toBe(200);
  const restored = environment.parseBody<DocumentContentDetail>(response);
  expect(Object.keys(restored).sort()).toEqual(CONTENT_DETAIL_KEYS);
  expect(restored).toMatchObject({ title: '原始标题', version: seeded.version + 1 });
  expect(restored.contentJson).toEqual(contentOf(10, '内容 A'));
  const rows = await revisionRows(seeded.id);
  expect(rows.map((row) => row.revision_number)).toEqual([1, 2, 3, 4]);
  expect(rows[3]).toMatchObject({
    content_json: contentOf(10, '内容 A'),
    source: 'restore',
    title: '原始标题',
  });
  const document = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['plain_text', 'title', 'version'])
    .where('id', '=', seeded.id)
    .executeTakeFirstOrThrow();
  expect(document).toMatchObject({
    plain_text: '内容 A',
    title: '原始标题',
    version: seeded.version + 1,
  });
}

/** 用于验证重复恢复同一快照不再堆叠重复修订。 */
async function dedupsRepeatedRestoresOfSameSnapshot(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '重复恢复库' }]);
  const seeded = await seedRestoreHistory();
  const first = await restoreRevision(seeded.id, '2', { version: seeded.version });
  expect(first.status).toBe(200);
  const replay = await restoreRevision(seeded.id, '2', {
    version: environment.parseBody<DocumentContentDetail>(first).version,
  });
  expect(replay.status).toBe(200);
  const rows = await revisionRows(seeded.id);
  expect(rows).toHaveLength(4);
  const document = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['version'])
    .where('id', '=', seeded.id)
    .executeTakeFirstOrThrow();
  expect(document.version).toBe(seeded.version + 2);
}

/** 用于验证并发相同的修订提交被行锁串行化为单个修订。 */
async function dedupsConcurrentRevisionSubmissions(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '主库' }]);
  const created = await createDocument('并发标题');
  const body = {
    contentJson: contentOf(2, '并发正文'),
    schemaVersion: 1,
    title: '并发快照',
    version: created.version,
  };
  const responses = await Promise.all([1, 2, 3].map(() => postRevision(created.id, body)));
  const numbers = responses.map(
    (response) => environment.parseBody<DocumentRevisionDetail>(response).revisionNumber,
  );
  expect(new Set(numbers).size).toBe(1);
  expect(await revisionRows(created.id)).toHaveLength(2);
}

/** 用于验证并发恢复恰好一胜一冲突。 */
async function resolvesConcurrentRestoresWithSingleWinner(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '并发恢复库' }]);
  const seeded = await seedRestoreHistory();
  const [first, second] = await Promise.all([
    restoreRevision(seeded.id, '2', { version: seeded.version }),
    restoreRevision(seeded.id, '3', { version: seeded.version }),
  ]);
  expect([first.status, second.status].sort()).toEqual([200, 409]);
  const rows = await revisionRows(seeded.id);
  expect(rows).toHaveLength(4);
  expect(rows[3]?.source).toBe('restore');
}

/** 用于仅在配置 PostgreSQL 时注册真实数据库 HTTP 场景。 */
function defineDocumentRevisionRestoreTests(): void {
  beforeAll(() => environment.prepareApplication(), 30_000);
  beforeEach(() => environment.resetFixtures());
  afterAll(() => environment.releaseApplication());
  test('restores revision keeping full history', restoresRevisionKeepingHistory);
  test('dedups repeated restores of the same snapshot', dedupsRepeatedRestoresOfSameSnapshot);
  test(
    'resolves concurrent restores with a single winner',
    resolvesConcurrentRestoresWithSingleWinner,
  );
  test(
    'dedups concurrent revision submissions into one revision',
    dedupsConcurrentRevisionSubmissions,
  );
}

describe.skipIf(databaseUrl === undefined)(
  'Document revision restore HTTP integration',
  defineDocumentRevisionRestoreTests,
);
