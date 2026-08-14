/** @fileoverview 在隔离的真实 PostgreSQL Schema 中验证知识库 HTTP 行为。 */
import type { Server } from 'node:http';

import type { KnowledgeBaseListResponse, KnowledgeBaseSummary } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import type { Insertable, Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { REQUEST_ID_HEADER } from '../request-correlation.middleware';
import { createDatabaseClient } from '../database/database.service';
import type { DatabaseSchema, DocumentTable, KnowledgeBaseTable } from '../database/database.types';
import { runMigrations } from '../database/migration-runner';
import { LOCAL_USER_ID } from '../local-identity.constants';
interface KnowledgeBaseFixture {
  readonly deletedAt?: Date | null;
  readonly description?: string;
  readonly id: string;
  readonly name: string;
  readonly ownerId?: string;
  readonly updatedAt: string;
}
interface DocumentFixture {
  readonly deleted?: boolean;
  readonly id: string;
  readonly knowledgeBaseId: string;
}

const databaseUrl = process.env.DATABASE_URL;
const schemaName = `knowledge_bases_http_${process.pid}`;
const otherUserId = '10000000-0000-4000-8000-000000000001';
const summaryKeys = ['description', 'documentCount', 'id', 'kind', 'name', 'updatedAt', 'version'];
let application: INestApplication | undefined;
let database: Kysely<DatabaseSchema> | undefined;
/** 用于为知识库夹具生成确定的有效 UUID。 */
function knowledgeBaseId(sequence: number): string {
  return `20000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}
/** 用于为文档夹具生成确定的有效 UUID。 */
function documentId(sequence: number): string {
  return `30000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}
/** 用于设置连接级搜索路径且不读取或修改凭据。 */
function createScopedDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set('options', `-csearch_path=${schemaName}`);
  return url.toString();
}
/** 用于在导入 AppModule 前提供必要的非生产配置。 */
function applyFixtureEnvironment(scopedDatabaseUrl: string): void {
  process.env.DATABASE_URL = scopedDatabaseUrl;
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  process.env.S3_ACCESS_KEY = 'integration-test-access';
  process.env.S3_BUCKET = 'integration-test';
  process.env.S3_ENDPOINT = 'http://127.0.0.1:8333';
  process.env.S3_FORCE_PATH_STYLE = 'true';
  process.env.S3_REGION = 'local';
  process.env.S3_SECRET_KEY = 'integration-test-secret';
}

/** 用于创建已迁移隔离 Schema 并启动生产 Nest 应用。 */
async function prepareApplication(): Promise<void> {
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.createSchema(schemaName).execute();
  await adminDatabase.destroy();
  const scopedDatabaseUrl = createScopedDatabaseUrl(databaseUrl!);
  database = await createDatabaseClient(scopedDatabaseUrl);
  await runMigrations(database, {
    direction: 'up',
    migrationLockTableName: 'migration_lock',
    migrationTableName: 'migration_history',
    migrationTableSchema: schemaName,
  });
  applyFixtureEnvironment(scopedDatabaseUrl);
  const { AppModule } = await import('../app.module');
  application = await NestFactory.create(AppModule, { logger: false });
  application.setGlobalPrefix('api/v1');
  await application.init();
}

/** 用于关闭自有连接池并删除隔离测试关系。 */
async function cleanApplication(): Promise<void> {
  await application?.close();
  await database?.destroy();
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.dropSchema(schemaName).cascade().execute();
  await adminDatabase.destroy();
}

/** 用于删除可变夹具并保留生产本地用户种子。 */
async function resetFixtures(): Promise<void> {
  await database!.deleteFrom('documents').execute();
  await database!.deleteFrom('knowledge_bases').execute();
  await database!.deleteFrom('users').where('id', '!=', LOCAL_USER_ID).execute();
}

/** 用于返回 Supertest 可接收的已初始化 HTTP 适配器服务。 */
function getHttpServer(): Server {
  if (application === undefined) throw new Error('Test application is not initialized');
  return application.getHttpServer() as Server;
}

/** 用于将 JSON 响应解析为当前断言所需投影。 */
function parseBody<ResponseBody>(response: { text: string }): ResponseBody {
  return JSON.parse(response.text) as ResponseBody;
}

/** 用于断言不含持久化字段的完整公开摘要投影。 */
function expectSafeSummary(
  summary: KnowledgeBaseSummary,
  name: string,
  description: string,
  documentCount: number,
): void {
  expect(Object.keys(summary).sort()).toEqual(summaryKeys);
  expect(summary).toMatchObject({ description, documentCount, kind: 'normal', name, version: 1 });
  expect(summary.id).toMatch(/^[0-9a-f-]{36}$/u);
  expect(Number.isNaN(Date.parse(summary.updatedAt))).toBe(false);
}

/** 用于断言稳定且带请求关联的公开错误。 */
function expectApiError(
  response: { get(field: string): string | undefined; status: number; text: string },
  status: number,
  code: string,
  message: string,
): Record<string, unknown> {
  const body = parseBody<Record<string, unknown>>(response);
  expect(response.status).toBe(status);
  expect(body).toMatchObject({ code, message });
  expect(body.requestId).toBe(response.get(REQUEST_ID_HEADER));
  return body;
}

/** 用于写入验证授权过滤的非本地所有者。 */
async function insertOtherUser(): Promise<void> {
  await database!
    .insertInto('users')
    .values({ id: otherUserId, display_name: '其他用户', timezone: 'Asia/Shanghai' })
    .execute();
}

/** 用于以精确 PostgreSQL 时间戳写入确定知识库记录。 */
async function insertKnowledgeBases(fixtures: readonly KnowledgeBaseFixture[]): Promise<void> {
  const rows: Insertable<KnowledgeBaseTable>[] = fixtures.map((fixture) => ({
    id: fixture.id,
    owner_id: fixture.ownerId ?? LOCAL_USER_ID,
    name: fixture.name,
    description: fixture.description ?? '',
    kind: 'normal',
    deleted_at: fixture.deletedAt ?? null,
    updated_at: fixture.updatedAt,
  }));
  await database!.insertInto('knowledge_bases').values(rows).execute();
}

/** 用于写入有效或软删除文档以验证计数投影。 */
async function insertDocuments(fixtures: readonly DocumentFixture[]): Promise<void> {
  const rows: Insertable<DocumentTable>[] = fixtures.map((fixture, position) => ({
    id: fixture.id,
    owner_id: LOCAL_USER_ID,
    knowledge_base_id: fixture.knowledgeBaseId,
    parent_id: null,
    path: `/${fixture.id}`,
    position,
    title: `文档 ${position + 1}`,
    deleted_at: fixture.deleted === true ? new Date('2026-08-13T00:00:00Z') : null,
    deleted_parent_id: null,
    deleted_position: fixture.deleted === true ? position : null,
  }));
  await database!.insertInto('documents').values(rows).execute();
}

/** 用于返回当前场景写入的知识库数量。 */
async function countKnowledgeBases(): Promise<number> {
  const result = await database!
    .selectFrom('knowledge_bases')
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  return Number(result.count);
}

/** 用于验证创建时裁剪字段且只持久化服务端身份和类型。 */
async function createsSafeKnowledgeBases(): Promise<void> {
  const describedResponse = await request(getHttpServer())
    .post('/api/v1/knowledge-bases')
    .send({ description: '  学习路线  ', name: '  深度学习  ' });
  expect(describedResponse.status).toBe(201);
  const described = parseBody<KnowledgeBaseSummary>(describedResponse);
  expectSafeSummary(described, '深度学习', '学习路线', 0);
  const defaultResponse = await request(getHttpServer())
    .post('/api/v1/knowledge-bases')
    .send({ name: '  默认说明  ' });
  expect(defaultResponse.status).toBe(201);
  const defaulted = parseBody<KnowledgeBaseSummary>(defaultResponse);
  expectSafeSummary(defaulted, '默认说明', '', 0);
  const ownedNormal = await database!
    .selectFrom('knowledge_bases')
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .where('owner_id', '=', LOCAL_USER_ID)
    .where('kind', '=', 'normal')
    .executeTakeFirstOrThrow();
  expect(Number(ownedNormal.count)).toBe(2);
}

/** 用于验证不安全创建正文被拒绝且不提交知识库。 */
async function rejectsInvalidCreateBodies(): Promise<void> {
  const invalidBodies: readonly object[] = [
    { name: '越权', ownerId: otherUserId },
    { kind: 'news', name: '系统伪装' },
    { name: ' \t\n ' },
    { name: 'x'.repeat(201) },
    { name: 42 },
    { description: null, name: '空说明' },
    { description: 'x'.repeat(2_001), name: '过长说明' },
  ];
  for (const body of invalidBodies) {
    const response = await request(getHttpServer()).post('/api/v1/knowledge-bases').send(body);
    expectApiError(response, 400, 'VALIDATION_FAILED', '请求参数校验失败。');
    expect(await countKnowledgeBases()).toBe(0);
  }
  const nonJson = await request(getHttpServer())
    .post('/api/v1/knowledge-bases')
    .set('Content-Type', 'text/plain')
    .send('name=not-json');
  expectApiError(nonJson, 415, 'UNSUPPORTED_MEDIA_TYPE', '请求正文必须使用 application/json。');
  const malformedJson = await request(getHttpServer())
    .post('/api/v1/knowledge-bases')
    .set('Content-Type', 'application/json')
    .send('{"name":');
  expectApiError(malformedJson, 400, 'BAD_REQUEST', '请求格式或参数无效。');
  expect(await countKnowledgeBases()).toBe(0);
}

/** 用于创建足量稳定记录以验证默认和允许的数量边界。 */
async function insertLimitFixtures(): Promise<void> {
  const fixtures = Array.from({ length: 21 }, (_, index): KnowledgeBaseFixture => {
    const sequence = index + 1;
    return {
      id: knowledgeBaseId(sequence),
      name: `边界 ${sequence}`,
      updatedAt: `2026-08-13T00:00:${sequence.toString().padStart(2, '0')}.000Z`,
    };
  });
  await insertKnowledgeBases(fixtures);
}

/** 用于验证有效数量边界并拒绝非法数量和游标。 */
async function validatesListQuery(): Promise<void> {
  await insertLimitFixtures();
  const defaultResponse = await request(getHttpServer()).get('/api/v1/knowledge-bases');
  const defaultBody = parseBody<KnowledgeBaseListResponse>(defaultResponse);
  expect(defaultResponse.status).toBe(200);
  expect(defaultBody.items).toHaveLength(20);
  expect(typeof defaultBody.nextCursor).toBe('string');
  const first = await request(getHttpServer()).get('/api/v1/knowledge-bases').query({ limit: 1 });
  const firstBody = parseBody<KnowledgeBaseListResponse>(first);
  expect(first.status).toBe(200);
  expect(firstBody.items).toHaveLength(1);
  expect(typeof firstBody.nextCursor).toBe('string');
  const largest = await request(getHttpServer())
    .get('/api/v1/knowledge-bases')
    .query({ limit: 100 });
  expect(largest.status).toBe(200);
  expect(parseBody<KnowledgeBaseListResponse>(largest)).toMatchObject({ nextCursor: null });
  const validCursor = firstBody.nextCursor!;
  const invalidQueries = [
    { limit: 'invalid' },
    { limit: 0 },
    { limit: 1.5 },
    { limit: 101 },
    { unexpected: 'field' },
    { cursor: 'not-a-cursor' },
    { cursor: 'x'.repeat(513) },
    { cursor: `${validCursor}=` },
  ];
  for (const query of invalidQueries) {
    const response = await request(getHttpServer()).get('/api/v1/knowledge-bases').query(query);
    expectApiError(response, 400, 'VALIDATION_FAILED', '请求参数校验失败。');
  }
}

/** 用于遍历全部游标页并保留服务端返回的分页边界。 */
async function fetchAllPages(limit: number): Promise<{
  readonly items: KnowledgeBaseSummary[];
  readonly pages: number;
}> {
  const items: KnowledgeBaseSummary[] = [];
  let cursor: string | undefined;
  for (let pages = 1; pages <= 10; pages += 1) {
    const query = cursor === undefined ? { limit } : { cursor, limit };
    const response = await request(getHttpServer()).get('/api/v1/knowledge-bases').query(query);
    expect(response.status).toBe(200);
    const body = parseBody<KnowledgeBaseListResponse>(response);
    items.push(...body.items);
    if (body.nextCursor === null) return { items, pages };
    cursor = body.nextCursor;
  }
  throw new Error('Cursor traversal did not terminate');
}

/** 用于验证无损排序、所有者与生命周期过滤及有效文档计数。 */
async function paginatesWithoutLoss(): Promise<void> {
  await insertOtherUser();
  const expectedIds = [7, 2, 8, 6, 1, 4, 5].map(knowledgeBaseId);
  await insertKnowledgeBases([
    { id: knowledgeBaseId(7), name: '最新', updatedAt: '2026-08-13T00:00:05.000000Z' },
    { id: knowledgeBaseId(2), name: '并列一', updatedAt: '2026-08-13T00:00:04.000000Z' },
    { id: knowledgeBaseId(8), name: '并列二', updatedAt: '2026-08-13T00:00:04.000000Z' },
    { id: knowledgeBaseId(6), name: '微秒高', updatedAt: '2026-08-13T00:00:03.123900Z' },
    { id: knowledgeBaseId(1), name: '微秒低', updatedAt: '2026-08-13T00:00:03.123100Z' },
    { id: knowledgeBaseId(4), name: '较旧', updatedAt: '2026-08-13T00:00:02.000000Z' },
    { id: knowledgeBaseId(5), name: '最旧', updatedAt: '2026-08-13T00:00:01.000000Z' },
    {
      id: knowledgeBaseId(9),
      name: '已删除',
      deletedAt: new Date(),
      updatedAt: '2026-08-13T00:00:06.000000Z',
    },
    {
      id: knowledgeBaseId(10),
      name: '其他用户',
      ownerId: otherUserId,
      updatedAt: '2026-08-13T00:00:07.000000Z',
    },
  ]);
  await insertDocuments([
    { id: documentId(1), knowledgeBaseId: knowledgeBaseId(7) },
    { id: documentId(2), knowledgeBaseId: knowledgeBaseId(7) },
    { id: documentId(3), knowledgeBaseId: knowledgeBaseId(7), deleted: true },
    { id: documentId(4), knowledgeBaseId: knowledgeBaseId(2) },
  ]);
  const result = await fetchAllPages(2);
  expect(result.pages).toBe(4);
  expect(result.items.map((item) => item.id)).toEqual(expectedIds);
  expect(new Set(result.items.map((item) => item.id)).size).toBe(expectedIds.length);
  expect(result.items.find((item) => item.id === knowledgeBaseId(7))?.documentCount).toBe(2);
  expect(result.items.find((item) => item.id === knowledgeBaseId(2))?.documentCount).toBe(1);
}

/** 用于验证自有摘要可读且所有不可访问标识不可区分。 */
async function readsOnlyOwnActiveKnowledgeBase(): Promise<void> {
  await insertOtherUser();
  await insertKnowledgeBases([
    {
      id: knowledgeBaseId(1),
      name: '可读取',
      description: '公开说明',
      updatedAt: '2026-08-13T00:00:03Z',
    },
    {
      id: knowledgeBaseId(2),
      name: 'other-owner-secret',
      ownerId: otherUserId,
      updatedAt: '2026-08-13T00:00:02Z',
    },
    {
      id: knowledgeBaseId(3),
      name: 'deleted-secret',
      deletedAt: new Date(),
      updatedAt: '2026-08-13T00:00:01Z',
    },
  ]);
  await insertDocuments([
    { id: documentId(1), knowledgeBaseId: knowledgeBaseId(1) },
    { id: documentId(2), knowledgeBaseId: knowledgeBaseId(1), deleted: true },
  ]);
  const ownResponse = await request(getHttpServer()).get(
    `/api/v1/knowledge-bases/${knowledgeBaseId(1)}`,
  );
  expect(ownResponse.status).toBe(200);
  expectSafeSummary(parseBody<KnowledgeBaseSummary>(ownResponse), '可读取', '公开说明', 1);
  const inaccessibleIds = [knowledgeBaseId(2), knowledgeBaseId(3), knowledgeBaseId(99)];
  for (const id of inaccessibleIds) {
    const response = await request(getHttpServer()).get(`/api/v1/knowledge-bases/${id}`);
    const body = expectApiError(response, 404, 'NOT_FOUND', '请求的资源不存在或不可访问。');
    expect(Object.keys(body).sort()).toEqual(['code', 'message', 'requestId']);
    expect(response.text).not.toContain('other-owner-secret');
    expect(response.text).not.toContain('deleted-secret');
  }
}

/** 用于仅在配置 PostgreSQL 时注册真实数据库 HTTP 场景。 */
function defineKnowledgeBaseIntegrationTests(): void {
  beforeAll(prepareApplication, 30_000);
  beforeEach(resetFixtures);
  afterAll(cleanApplication);
  test('creates trimmed safe summaries with server-owned fields', createsSafeKnowledgeBases);
  test('rejects invalid and non-JSON creates without writes', rejectsInvalidCreateBodies);
  test('validates list limits and opaque cursors', validatesListQuery);
  test('paginates real rows without duplicates or omissions', paginatesWithoutLoss);
  test('reads only own active knowledge bases without disclosure', readsOnlyOwnActiveKnowledgeBase);
}

describe.skipIf(databaseUrl === undefined)(
  'Knowledge base HTTP integration',
  defineKnowledgeBaseIntegrationTests,
);
