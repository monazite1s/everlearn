/** @fileoverview 在真实 PostgreSQL 中验证知识库乐观生命周期行为。 */

import type { Server } from 'node:http';

import type { KnowledgeBaseSummary } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Insertable, Kysely, Selectable } from 'kysely' with { 'resolution-mode': 'import' };
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import type { DatabaseSchema, DocumentTable, KnowledgeBaseTable } from '../database/database.types';
import { createDatabaseClient } from '../database/database.service';
import { runMigrations } from '../database/migration-runner';
import { LOCAL_USER_ID } from '../local-identity.constants';
import { REQUEST_ID_HEADER } from '../request-correlation.middleware';

const databaseUrl = process.env.DATABASE_URL;
const schemaName = `knowledge_lifecycle_${process.pid}`;
const ownId = '41000000-0000-4000-8000-000000000001';
const otherId = '41000000-0000-4000-8000-000000000002';
const otherUserId = '41000000-0000-4000-8000-000000000003';
let application: INestApplication | undefined;
let database: Kysely<DatabaseSchema> | undefined;

/** 用于设置连接级搜索路径且不修改凭据。 */
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

/** 用于创建已迁移隔离 Schema 和生产 Nest 应用。 */
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

/** 用于关闭自有连接池并删除隔离测试 Schema。 */
async function cleanApplication(): Promise<void> {
  await application?.close();
  await database?.destroy();
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.dropSchema(schemaName).cascade().execute();
  await adminDatabase.destroy();
}

/** 用于在每个场景前恢复确定的所有者范围夹具。 */
async function resetFixtures(): Promise<void> {
  await database!.deleteFrom('idempotency_records').execute();
  await database!.deleteFrom('documents').execute();
  await database!.deleteFrom('knowledge_bases').execute();
  await database!.deleteFrom('users').where('id', '!=', LOCAL_USER_ID).execute();
  await database!
    .insertInto('users')
    .values({ id: otherUserId, display_name: '其他用户', timezone: 'Asia/Shanghai' })
    .execute();
  await insertKnowledgeBase({ id: ownId, owner_id: LOCAL_USER_ID });
  await insertKnowledgeBase({ id: otherId, owner_id: otherUserId });
}

/** 用于写入明确所有权和删除状态的生命周期夹具。 */
async function insertKnowledgeBase(
  input: Pick<Insertable<KnowledgeBaseTable>, 'id' | 'owner_id'> &
    Partial<Pick<Insertable<KnowledgeBaseTable>, 'deleted_at' | 'version'>>,
): Promise<void> {
  await database!
    .insertInto('knowledge_bases')
    .values({
      description: '原说明',
      id: input.id,
      kind: 'normal',
      name: '原名称',
      owner_id: input.owner_id,
      ...(input.deleted_at === undefined ? {} : { deleted_at: input.deleted_at }),
      ...(input.version === undefined ? {} : { version: input.version }),
    })
    .execute();
}

/** 用于返回 Supertest 可接收的已初始化 HTTP 适配器。 */
function getHttpServer(): Server {
  if (application === undefined) throw new Error('Test application is not initialized');
  return application.getHttpServer() as Server;
}

/** 用于将 JSON 响应解析为预期投影。 */
function parseBody<ResponseBody>(response: { text: string }): ResponseBody {
  return JSON.parse(response.text) as ResponseBody;
}

/** 用于断言稳定且带请求关联的公开错误。 */
function expectApiError(
  response: { get(field: string): string | undefined; status: number; text: string },
  status: number,
  code: string,
): void {
  const body = parseBody<Record<string, unknown>>(response);
  expect(response.status).toBe(status);
  expect(body.code).toBe(code);
  expect(body.requestId).toBe(response.get(REQUEST_ID_HEADER));
}

/** 用于读取生命周期记录以执行精确未写入断言。 */
function readKnowledgeBase(id = ownId): Promise<Selectable<KnowledgeBaseTable>> {
  return database!
    .selectFrom('knowledge_bases')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirstOrThrow();
}

/** 用于写入有效和独立删除文档并返回生命周期事实。 */
async function insertLifecycleDocuments(): Promise<readonly object[]> {
  const activeId = '42000000-0000-4000-8000-000000000001';
  const deletedId = '42000000-0000-4000-8000-000000000002';
  const documents: Insertable<DocumentTable>[] = [
    {
      id: activeId,
      knowledge_base_id: ownId,
      owner_id: LOCAL_USER_ID,
      parent_id: null,
      path: `/${activeId}`,
      position: 0,
      title: '活跃文档',
    },
    {
      deleted_at: new Date('2026-08-13T00:00:00Z'),
      deleted_parent_id: null,
      deleted_position: 1,
      id: deletedId,
      knowledge_base_id: ownId,
      owner_id: LOCAL_USER_ID,
      parent_id: null,
      path: `/${deletedId}`,
      position: 1,
      title: '此前已删除',
    },
  ];
  await database!.insertInto('documents').values(documents).execute();
  return readDocumentLifecycleFacts();
}

/** 用于只读取知识库生命周期操作必须保留的文档字段。 */
function readDocumentLifecycleFacts(): Promise<readonly object[]> {
  return database!
    .selectFrom('documents')
    .select([
      'id',
      'deleted_at',
      'deleted_parent_id',
      'deleted_position',
      'parent_id',
      'path',
      'position',
      'version',
    ])
    .orderBy('position')
    .execute();
}

/** 用于验证裁剪更新成功一次并拒绝过期、空或不安全写入。 */
async function updatesOptimistically(): Promise<void> {
  const response = await request(getHttpServer())
    .patch(`/api/v1/knowledge-bases/${ownId}`)
    .send({ description: '  新说明  ', name: '  新名称  ', version: 1 });
  expect(response.status).toBe(200);
  expect(parseBody<KnowledgeBaseSummary>(response)).toMatchObject({
    description: '新说明',
    name: '新名称',
    version: 2,
  });
  const stale = await request(getHttpServer())
    .patch(`/api/v1/knowledge-bases/${ownId}`)
    .send({ name: '不应写入', version: 1 });
  expectApiError(stale, 409, 'VERSION_CONFLICT');
  expect(await readKnowledgeBase()).toMatchObject({ name: '新名称', version: 2 });
  for (const body of [{ version: 2 }, { ownerId: otherUserId, version: 2 }]) {
    const invalid = await request(getHttpServer())
      .patch(`/api/v1/knowledge-bases/${ownId}`)
      .send(body);
    expectApiError(invalid, 400, 'VALIDATION_FAILED');
  }
}

/** 用于验证他人、缺失和已删除更新目标不可区分。 */
async function hidesInaccessibleUpdates(): Promise<void> {
  await database!
    .updateTable('knowledge_bases')
    .set({ deleted_at: new Date(), version: 2 })
    .where('id', '=', ownId)
    .execute();
  for (const id of [ownId, otherId, '41000000-0000-4000-8000-000000000099']) {
    const response = await request(getHttpServer())
      .patch(`/api/v1/knowledge-bases/${id}`)
      .send({ name: '不可探测', version: 2 });
    expectApiError(response, 404, 'NOT_FOUND');
  }
}

/** 用于验证软删除仅修改知识库行且精确重试不增加版本。 */
async function deletesWithoutRewritingDocuments(): Promise<void> {
  const documentFacts = await insertLifecycleDocuments();
  const first = await request(getHttpServer())
    .delete(`/api/v1/knowledge-bases/${ownId}`)
    .send({ version: 1 });
  expect(first.status).toBe(204);
  const deleted = await readKnowledgeBase();
  expect(deleted.version).toBe(2);
  expect(deleted.deleted_at).not.toBeNull();
  expect(await readDocumentLifecycleFacts()).toEqual(documentFacts);
  const replay = await request(getHttpServer())
    .delete(`/api/v1/knowledge-bases/${ownId}`)
    .send({ version: 1 });
  expect(replay.status).toBe(204);
  const afterReplay = await readKnowledgeBase();
  expect(afterReplay.version).toBe(2);
  expect(afterReplay.deleted_at?.toISOString()).toBe(deleted.deleted_at?.toISOString());
  const invalidReplay = await request(getHttpServer())
    .delete(`/api/v1/knowledge-bases/${ownId}`)
    .send({ version: 2 });
  expectApiError(invalidReplay, 409, 'VERSION_CONFLICT');
  expect(await readKnowledgeBase()).toEqual(afterReplay);
  expect((await request(getHttpServer()).get(`/api/v1/knowledge-bases/${ownId}`)).status).toBe(404);
}

/** 用于验证恢复一次、重放首次响应并拒绝冲突键复用。 */
async function restoresIdempotently(): Promise<void> {
  const documentFacts = await insertLifecycleDocuments();
  await database!
    .updateTable('knowledge_bases')
    .set({ deleted_at: new Date('2026-08-14T00:00:00Z'), version: 2 })
    .where('id', '=', ownId)
    .execute();
  /** 用于以场景固定幂等键发送恢复请求。 */
  const sendRestore = (version: number): Promise<request.Response> =>
    request(getHttpServer())
      .post(`/api/v1/knowledge-bases/${ownId}/restore`)
      .set('Idempotency-Key', 'restore-own-1')
      .send({ version });
  const [first, concurrentReplay] = await Promise.all([sendRestore(2), sendRestore(2)]);
  expect(first.status).toBe(200);
  expect(concurrentReplay.status).toBe(200);
  expect(concurrentReplay.text).toBe(first.text);
  expect((await readKnowledgeBase()).version).toBe(3);
  expect(await readDocumentLifecycleFacts()).toEqual(documentFacts);
  const records = await database!
    .selectFrom('idempotency_records')
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  expect(Number(records.count)).toBe(1);
  const keyConflict = await sendRestore(3);
  expectApiError(keyConflict, 409, 'IDEMPOTENCY_CONFLICT');
  const newKeyActive = await request(getHttpServer())
    .post(`/api/v1/knowledge-bases/${ownId}/restore`)
    .set('Idempotency-Key', 'restore-own-2')
    .send({ version: 3 });
  expectApiError(newKeyActive, 409, 'CONFLICT');
}

/** 用于验证缺失键、非 JSON、过期版本和他人目标被拒绝。 */
async function rejectsUnsafeLifecycleRequests(): Promise<void> {
  await database!
    .updateTable('knowledge_bases')
    .set({ deleted_at: new Date(), version: 2 })
    .where('id', '=', ownId)
    .execute();
  const missingKey = await request(getHttpServer())
    .post(`/api/v1/knowledge-bases/${ownId}/restore`)
    .send({ version: 2 });
  expectApiError(missingKey, 400, 'BAD_REQUEST');
  const stale = await request(getHttpServer())
    .post(`/api/v1/knowledge-bases/${ownId}/restore`)
    .set('Idempotency-Key', 'stale')
    .send({ version: 1 });
  expectApiError(stale, 409, 'VERSION_CONFLICT');
  expect(
    Number(
      (
        await database!
          .selectFrom('idempotency_records')
          .select(({ fn }) => fn.countAll<number>().as('count'))
          .executeTakeFirstOrThrow()
      ).count,
    ),
  ).toBe(0);
  const foreign = await request(getHttpServer())
    .post(`/api/v1/knowledge-bases/${otherId}/restore`)
    .set('Idempotency-Key', 'foreign')
    .send({ version: 1 });
  expectApiError(foreign, 404, 'NOT_FOUND');
  const nonJson = await request(getHttpServer())
    .patch(`/api/v1/knowledge-bases/${ownId}`)
    .set('Content-Type', 'text/plain')
    .send('version=2');
  expectApiError(nonJson, 415, 'UNSUPPORTED_MEDIA_TYPE');
  const deleteNonJson = await request(getHttpServer())
    .delete(`/api/v1/knowledge-bases/${ownId}`)
    .set('Content-Type', 'text/plain')
    .send('version=2');
  expectApiError(deleteNonJson, 415, 'UNSUPPORTED_MEDIA_TYPE');
}

/** 用于验证过期和他人删除目标被拒绝且数据库事实不变。 */
async function rejectsUnsafeDeletes(): Promise<void> {
  const stale = await request(getHttpServer())
    .delete(`/api/v1/knowledge-bases/${ownId}`)
    .send({ version: 2 });
  expectApiError(stale, 409, 'VERSION_CONFLICT');
  expect(await readKnowledgeBase()).toMatchObject({ deleted_at: null, version: 1 });
  const foreign = await request(getHttpServer())
    .delete(`/api/v1/knowledge-bases/${otherId}`)
    .send({ version: 1 });
  expectApiError(foreign, 404, 'NOT_FOUND');
  const missing = await request(getHttpServer())
    .delete('/api/v1/knowledge-bases/41000000-0000-4000-8000-000000000099')
    .send({ version: 1 });
  expectApiError(missing, 404, 'NOT_FOUND');
}

/** 用于仅在配置 PostgreSQL 时注册真实数据库场景。 */
function defineLifecycleIntegrationTests(): void {
  beforeAll(prepareApplication, 30_000);
  beforeEach(resetFixtures);
  afterAll(cleanApplication);
  test('updates metadata with optimistic concurrency', updatesOptimistically);
  test('hides inaccessible update targets', hidesInaccessibleUpdates);
  test('soft-deletes without rewriting documents', deletesWithoutRewritingDocuments);
  test('restores once with concurrent idempotent replay', restoresIdempotently);
  test('rejects unsafe lifecycle requests', rejectsUnsafeLifecycleRequests);
  test('rejects stale and inaccessible deletes', rejectsUnsafeDeletes);
}

describe.skipIf(databaseUrl === undefined)(
  'Knowledge-base lifecycle HTTP integration',
  defineLifecycleIntegrationTests,
);
