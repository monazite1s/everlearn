/** @fileoverview 在隔离的真实 PostgreSQL Schema 中验证文档树移动行为。 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import type { DocumentDetail, DocumentListResponse } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import {
  DocumentsTestEnvironment,
  type DocumentFixture,
} from '../../tests/documents-integration.support';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(
  `documents_move_${process.pid}`,
  databaseUrl ?? '',
);

/** 用于为知识库夹具生成确定的有效 UUID。 */
function knowledgeBaseId(sequence: number): string {
  return `a0000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于为文档夹具生成确定的有效 UUID。 */
function documentId(sequence: number): string {
  return `b0000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

/** 用于发送带固定幂等键的移动请求。 */
function sendMove(id: string, body: object, key = 'move-key'): Promise<request.Response> {
  return request(environment.getHttpServer())
    .post(`/api/v1/documents/${id}/move`)
    .set('Idempotency-Key', key)
    .send(body);
}

/** 用于按服务端排序读取指定父级的活跃子节点标题。 */
async function listChildTitles(knowledgeBase: string, parentId?: string): Promise<string[]> {
  const response = await request(environment.getHttpServer())
    .get(`/api/v1/knowledge-bases/${knowledgeBase}/documents`)
    .query(parentId === undefined ? {} : { parentId });
  expect(response.status).toBe(200);
  return environment.parseBody<DocumentListResponse>(response).items.map((item) => item.title);
}

/** 用于承载三层子树夹具的节点标识。 */
interface TreeFixtureIds {
  readonly child: string;
  readonly grandchild: string;
  readonly host: string;
  readonly root: string;
  readonly subtreeRoot: string;
}

/** 用于写入三层子树夹具并返回根与节点标识。 */
async function insertTreeFixtures(): Promise<TreeFixtureIds> {
  const root = documentId(1);
  const subtreeRoot = documentId(2);
  const child = documentId(3);
  const grandchild = documentId(4);
  const host = documentId(5);
  const hostChild = documentId(6);
  const fixtures: readonly DocumentFixture[] = [
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
    { id: host, knowledgeBaseId: knowledgeBaseId(1), position: 1024, title: '目标父' },
    {
      id: hostChild,
      childOf: host,
      knowledgeBaseId: knowledgeBaseId(1),
      position: 2048,
      title: '目标父已有子',
    },
  ];
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '主库' }]);
  await environment.insertDocuments(fixtures);
  return { child, grandchild, host, root, subtreeRoot };
}

/** 用于读取单个文档的更新时间基线。 */
function readUpdatedAt(id: string): Promise<{ updated_at: Date }> {
  return environment
    .getDatabase()
    .selectFrom('documents')
    .select(['updated_at'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
}

/** 用于读取树行断言所需的稳定字段并按标识排序。 */
function readTreeRows(ids: readonly string[]): Promise<readonly object[]> {
  return environment
    .getDatabase()
    .selectFrom('documents')
    .select(['id', 'parent_id', 'path', 'position', 'version'])
    .where('id', 'in', ids)
    .orderBy('id')
    .execute();
}

/** 用于验证整棵子树原子换父且后代路径、排序与版本符合规则。 */
async function movesSubtreeWithDescendantPaths(): Promise<void> {
  const { child, grandchild, host, root, subtreeRoot } = await insertTreeFixtures();
  const beforeMoved = await readUpdatedAt(subtreeRoot);
  const beforeChild = await readUpdatedAt(child);
  const response = await sendMove(subtreeRoot, { targetParentId: host, version: 1 });
  expect(response.status).toBe(200);
  const detail = environment.parseBody<DocumentDetail>(response);
  expect(detail).toMatchObject({ id: subtreeRoot, parentId: host, version: 2 });
  expect(Date.parse(detail.updatedAt)).toBeGreaterThan(beforeMoved.updated_at.getTime());
  const afterMoved = await readUpdatedAt(subtreeRoot);
  const afterChild = await readUpdatedAt(child);
  expect(afterMoved.updated_at.getTime()).toBeGreaterThan(beforeMoved.updated_at.getTime());
  expect(afterChild.updated_at).toEqual(beforeChild.updated_at);
  expect(await readTreeRows([subtreeRoot, child, grandchild])).toEqual([
    {
      id: subtreeRoot,
      parent_id: host,
      path: `/${host}/${subtreeRoot}`,
      position: '3072',
      version: 2,
    },
    {
      id: child,
      parent_id: subtreeRoot,
      path: `/${host}/${subtreeRoot}/${child}`,
      position: '0',
      version: 1,
    },
    {
      id: grandchild,
      parent_id: child,
      path: `/${host}/${subtreeRoot}/${child}/${grandchild}`,
      position: '1024',
      version: 1,
    },
  ]);
  expect(await listChildTitles(knowledgeBaseId(1), host)).toEqual(['目标父已有子', '子树根']);
  expect(await listChildTitles(knowledgeBaseId(1), root)).toEqual([]);
}

/** 用于验证省略目标父级时移动到知识库根部。 */
async function movesToRootWhenTargetOmitted(): Promise<void> {
  const { child, subtreeRoot } = await insertTreeFixtures();
  const response = await sendMove(subtreeRoot, { version: 1 });
  expect(response.status).toBe(200);
  const rows = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['parent_id', 'path', 'position'])
    .where('id', 'in', [subtreeRoot, child])
    .orderBy('id')
    .execute();
  expect(rows).toEqual([
    { parent_id: null, path: `/${subtreeRoot}`, position: '2048' },
    { parent_id: subtreeRoot, path: `/${subtreeRoot}/${child}`, position: '0' },
  ]);
}

/** 用于验证相邻定位在同父内获得稳定顺序且兄弟版本不变。 */
async function reordersWithinParentByAnchor(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '主库' }]);
  const parent = documentId(1);
  const x = documentId(2);
  const y = documentId(3);
  const z = documentId(4);
  await environment.insertDocuments([
    { id: parent, knowledgeBaseId: knowledgeBaseId(1), position: 0, title: '父' },
    { id: x, childOf: parent, knowledgeBaseId: knowledgeBaseId(1), position: 0, title: 'x' },
    { id: y, childOf: parent, knowledgeBaseId: knowledgeBaseId(1), position: 1024, title: 'y' },
    { id: z, childOf: parent, knowledgeBaseId: knowledgeBaseId(1), position: 2048, title: 'z' },
  ]);
  const before = await sendMove(z, { beforeId: y, targetParentId: parent, version: 1 });
  expect(before.status).toBe(200);
  const after = await sendMove(x, { afterId: z, targetParentId: parent, version: 1 }, 'move-key-2');
  expect(after.status).toBe(200);
  expect(await listChildTitles(knowledgeBaseId(1), parent)).toEqual(['z', 'x', 'y']);
  const rows = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['id', 'position', 'version'])
    .where('id', 'in', [x, y, z])
    .orderBy('id')
    .execute();
  expect(rows).toEqual([
    { id: x, position: '768', version: 2 },
    { id: y, position: '1024', version: 1 },
    { id: z, position: '512', version: 2 },
  ]);
}

/** 用于验证相邻整数间隔耗尽时对同父兄弟执行一次再平衡。 */
async function rebalancesWhenGapExhausted(): Promise<void> {
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId(1), name: '主库' }]);
  const parent = documentId(1);
  const p = documentId(2);
  const q = documentId(3);
  const r = documentId(4);
  await environment.insertDocuments([
    { id: parent, knowledgeBaseId: knowledgeBaseId(1), position: 0, title: '父' },
    { id: p, childOf: parent, knowledgeBaseId: knowledgeBaseId(1), position: 0, title: 'p' },
    { id: q, childOf: parent, knowledgeBaseId: knowledgeBaseId(1), position: 1, title: 'q' },
    { id: r, childOf: parent, knowledgeBaseId: knowledgeBaseId(1), position: 2, title: 'r' },
  ]);
  const response = await sendMove(r, { beforeId: q, targetParentId: parent, version: 1 });
  expect(response.status).toBe(200);
  expect(await listChildTitles(knowledgeBaseId(1), parent)).toEqual(['p', 'r', 'q']);
  const rows = await environment
    .getDatabase()
    .selectFrom('documents')
    .select(['id', 'position', 'version'])
    .where('id', 'in', [p, q, r])
    .orderBy('id')
    .execute();
  expect(rows).toEqual([
    { id: p, position: '0', version: 1 },
    { id: q, position: '2048', version: 1 },
    { id: r, position: '1024', version: 2 },
  ]);
}

/** 用于仅在配置 PostgreSQL 时注册真实数据库 HTTP 场景。 */
function defineDocumentMoveIntegrationTests(): void {
  beforeAll(() => environment.prepareApplication(), 30_000);
  beforeEach(() => environment.resetFixtures());
  afterAll(() => environment.releaseApplication());
  test('moves subtree with descendant paths atomically', movesSubtreeWithDescendantPaths);
  test('moves to root when target parent omitted', movesToRootWhenTargetOmitted);
  test('reorders within parent by adjacent anchor', reordersWithinParentByAnchor);
  test('rebalances siblings when adjacent gap exhausted', rebalancesWhenGapExhausted);
}

describe.skipIf(databaseUrl === undefined)(
  'Document move HTTP integration',
  defineDocumentMoveIntegrationTests,
);
