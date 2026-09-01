/** @fileoverview 在隔离的真实 PostgreSQL Schema 中验证回收站聚合投影。 */
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import type { TrashItem, TrashListResponse } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import { DocumentsTestEnvironment, otherUserId } from '../../tests/documents-integration.support';
import { runMigrations } from '../database/migration-runner';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(`trash_list_${process.pid}`, databaseUrl ?? '');

/** 用于为知识库与文档夹具生成确定的有效 UUID。 */
function fixedId(kind: string, sequence: number): string {
  return `${kind}0000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

interface DocumentSeed {
  childOf?: string;
  deletedAt?: Date;
  id: string;
  knowledgeBaseId: string;
  ownerId?: string;
  position: number;
  title: string;
}

/** 用于直接写入带受控删除时间的文档夹具。 */
async function insertDeletedDocuments(seeds: readonly DocumentSeed[]): Promise<void> {
  await environment
    .getDatabase()
    .insertInto('documents')
    .values(
      seeds.map((seed) => ({
        deleted_at: seed.deletedAt ?? null,
        deleted_parent_id: null,
        deleted_position: seed.deletedAt === undefined ? null : seed.position,
        id: seed.id,
        knowledge_base_id: seed.knowledgeBaseId,
        owner_id: seed.ownerId ?? '00000000-0000-4000-8000-000000000001',
        parent_id: seed.childOf ?? null,
        path: seed.childOf === undefined ? `/${seed.id}` : `/${seed.childOf}/${seed.id}`,
        position: seed.position,
        title: seed.title,
      })),
    )
    .execute();
}

/** 用于请求回收站列表并解析公开投影。 */
async function listTrash(query: Record<string, unknown> = {}): Promise<TrashListResponse> {
  const response = await request(environment.getHttpServer()).get('/api/v1/trash').query(query);
  expect(response.status).toBe(200);
  return environment.parseBody<TrashListResponse>(response);
}

/** 用于构造断言用的完整回收站条目投影。 */
function expectedItem(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    knowledgeBaseId: '',
    knowledgeBaseName: '',
    objectType: 'document',
    ...overrides,
  };
}

/** 用于写入混合删除状态的回收站投影夹具。 */
async function seedMixedTrashFixtures(): Promise<void> {
  const activeBase = fixedId('8', 1);
  const deletedBase = fixedId('8', 2);
  await environment.insertKnowledgeBases([
    { id: activeBase, name: '主库' },
    { deletedAt: new Date('2026-08-16T00:00:00Z'), id: deletedBase, name: '已删库' },
  ]);
  await insertDeletedDocuments([
    {
      deletedAt: new Date('2026-08-15T00:00:00Z'),
      id: fixedId('9', 1),
      knowledgeBaseId: activeBase,
      position: 0,
      title: '独立删除的根',
    },
    {
      childOf: fixedId('9', 1),
      deletedAt: new Date('2026-08-15T00:00:00Z'),
      id: fixedId('9', 2),
      knowledgeBaseId: activeBase,
      position: 0,
      title: '随父删除的子',
    },
    {
      id: fixedId('9', 3),
      knowledgeBaseId: activeBase,
      position: 1024,
      title: '活跃根',
    },
    {
      id: fixedId('9', 4),
      knowledgeBaseId: deletedBase,
      position: 0,
      title: '已删库内的未删除文档',
    },
    {
      deletedAt: new Date('2026-08-17T00:00:00Z'),
      id: fixedId('9', 7),
      knowledgeBaseId: deletedBase,
      position: 2048,
      title: '库先删除后仍独立的已删文档',
    },
  ]);
}

/** 用于验证回收站同时投影已删知识库与独立删除的文档子树根。 */
async function projectsKnowledgeBasesAndIndependentDocuments(): Promise<void> {
  const activeBase = fixedId('8', 1);
  const deletedBase = fixedId('8', 2);
  await seedMixedTrashFixtures();
  const page = await listTrash();
  expect(page.nextCursor).toBeNull();
  expect(page.items).toEqual([
    expectedItem({
      deletedAt: '2026-08-17T00:00:00.000000Z',
      id: fixedId('9', 7),
      knowledgeBaseId: deletedBase,
      knowledgeBaseName: '已删库',
      purgeScheduledAt: '2026-09-16T00:00:00.000000Z',
      title: '库先删除后仍独立的已删文档',
      version: 1,
    }),
    expectedItem({
      deletedAt: '2026-08-16T00:00:00.000000Z',
      id: deletedBase,
      knowledgeBaseId: deletedBase,
      knowledgeBaseName: '已删库',
      objectType: 'knowledge-base',
      purgeScheduledAt: '2026-09-15T00:00:00.000000Z',
      title: '已删库',
      version: 1,
    }),
    expectedItem({
      deletedAt: '2026-08-15T00:00:00.000000Z',
      id: fixedId('9', 1),
      knowledgeBaseId: activeBase,
      knowledgeBaseName: '主库',
      purgeScheduledAt: '2026-09-14T00:00:00.000000Z',
      title: '独立删除的根',
      version: 1,
    }),
  ]);
}

/** 用于验证到期时间精确等于删除时间加固定保留天数。 */
async function schedulesPurgeExactlyRetentionDaysLater(): Promise<void> {
  const base = fixedId('8', 3);
  await environment.insertKnowledgeBases([{ id: base, name: '主库' }]);
  await insertDeletedDocuments([
    {
      deletedAt: new Date('2026-07-18T00:00:00.000Z'),
      id: fixedId('9', 5),
      knowledgeBaseId: base,
      position: 0,
      title: '已到期临界',
    },
    {
      deletedAt: new Date('2026-07-19T12:34:56.789Z'),
      id: fixedId('9', 6),
      knowledgeBaseId: base,
      position: 1024,
      title: '未到期临界',
    },
  ]);
  const page = await listTrash();
  const purges = page.items.map((item: TrashItem) => item.purgeScheduledAt);
  expect(purges).toEqual(['2026-08-18T12:34:56.789000Z', '2026-08-17T00:00:00.000000Z']);
}

/** 用于验证回收站只包含当前所有者的条目。 */
async function restrictsEntriesToCurrentOwner(): Promise<void> {
  await environment.insertOtherUser();
  const ownBase = fixedId('8', 4);
  const otherBase = fixedId('8', 5);
  await environment.insertKnowledgeBases([
    { id: ownBase, name: '自己库' },
    {
      deletedAt: new Date('2026-08-15T00:00:00Z'),
      id: otherBase,
      name: '他人库',
      ownerId: otherUserId,
    },
  ]);
  await insertDeletedDocuments([
    {
      deletedAt: new Date('2026-08-15T00:00:00Z'),
      id: fixedId('9', 7),
      knowledgeBaseId: ownBase,
      position: 0,
      title: '自己的已删文档',
    },
    {
      deletedAt: new Date('2026-08-15T00:00:00Z'),
      id: fixedId('9', 8),
      knowledgeBaseId: otherBase,
      ownerId: otherUserId,
      position: 0,
      title: '他人的已删文档',
    },
  ]);
  const page = await listTrash();
  expect(page.items.map((item) => item.id)).toEqual([fixedId('9', 7)]);
}

/** 用于验证回收站按删除时间倒序游标分页且无重复或遗漏。 */
async function paginatesByStableDeletedOrder(): Promise<void> {
  const base = fixedId('8', 6);
  await environment.insertKnowledgeBases([{ id: base, name: '主库' }]);
  const seeds = [1, 2, 3].map((sequence) => ({
    deletedAt: new Date(`2026-08-1${sequence}T00:00:00Z`),
    id: fixedId('9', sequence + 10),
    knowledgeBaseId: base,
    position: sequence * 1024,
    title: `文档 ${sequence}`,
  }));
  await insertDeletedDocuments(seeds);
  const firstPage = await listTrash({ limit: 2 });
  expect(firstPage.items.map((item) => item.title)).toEqual(['文档 3', '文档 2']);
  expect(firstPage.nextCursor).not.toBeNull();
  const secondPage = await listTrash({ cursor: firstPage.nextCursor ?? '' });
  expect(secondPage.items.map((item) => item.title)).toEqual(['文档 1']);
  expect(secondPage.nextCursor).toBeNull();
  const seen = [...firstPage.items, ...secondPage.items].map((item) => item.id);
  expect(new Set(seen).size).toBe(seen.length);
}

/** 用于验证非法分页参数与游标被统一拒绝。 */
async function rejectsInvalidListQueries(): Promise<void> {
  const invalidQueries = [{ limit: 0 }, { limit: 101 }, { cursor: 'not-a-cursor' }];
  for (const query of invalidQueries) {
    const response = await request(environment.getHttpServer()).get('/api/v1/trash').query(query);
    environment.expectApiError(response, 400, 'VALIDATION_FAILED', '请求参数校验失败。');
  }
}

/** 用于验证回收站部分索引可随迁移回退并再次应用。 */
async function migratesTrashIndexesReversibly(): Promise<void> {
  const { sql } = await import('kysely');
  const schemaName = `trash_list_${process.pid}`;
  const options = {
    direction: 'up' as const,
    migrationLockTableName: 'migration_lock',
    migrationTableName: 'migration_history',
    migrationTableSchema: schemaName,
  };
  /** 用于读取隔离 Schema 内的回收站相关索引名。 */
  const indexNames = async (): Promise<readonly string[]> => {
    const result = await sql<{ indexname: string }>`
      SELECT indexname AS "indexname" FROM pg_indexes
      WHERE schemaname = ${schemaName} AND tablename IN ('documents', 'knowledge_bases')
    `.execute(environment.getDatabase());
    return result.rows.map((row) => row.indexname);
  };
  expect((await indexNames()).includes('documents_trash_idx')).toBe(true);
  const reverted: string[] = [];
  while (!reverted.includes('20260817000000_trash_retention_indexes') && reverted.length < 10) {
    const step = await runMigrations(environment.getDatabase(), { ...options, direction: 'down' });
    reverted.push(...step.executedMigrations);
  }
  expect(reverted.at(-1)).toBe('20260817000000_trash_retention_indexes');
  expect((await indexNames()).includes('documents_trash_idx')).toBe(false);
  const up = await runMigrations(environment.getDatabase(), options);
  expect(up.executedMigrations).toEqual(reverted.toReversed());
  expect((await indexNames()).includes('knowledge_bases_trash_idx')).toBe(true);
}

/** 用于仅在配置 PostgreSQL 时注册真实数据库 HTTP 场景。 */
function defineTrashListIntegrationTests(): void {
  beforeAll(() => environment.prepareApplication(), 30_000);
  beforeEach(() => environment.resetFixtures());
  afterAll(() => environment.releaseApplication());
  test(
    'projects deleted knowledge bases and independent document roots',
    projectsKnowledgeBasesAndIndependentDocuments,
  );
  test('schedules purge exactly retention days later', schedulesPurgeExactlyRetentionDaysLater);
  test('restricts entries to current owner', restrictsEntriesToCurrentOwner);
  test('paginates by stable deleted order', paginatesByStableDeletedOrder);
  test('rejects invalid list queries', rejectsInvalidListQueries);
  test('migrates trash indexes reversibly', migratesTrashIndexesReversibly);
}

describe.skipIf(databaseUrl === undefined)(
  'Trash list HTTP integration',
  defineTrashListIntegrationTests,
);
