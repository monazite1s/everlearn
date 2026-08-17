/** @fileoverview 在 PostgreSQL 中验证生产身份与知识库迁移。 */

import type { Insertable, Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { createDatabaseClient } from './database.service';
import type { DatabaseSchema, DocumentTable } from './database.types';
import { runMigrations } from './migration-runner';
import { LOCAL_USER_ID } from './migrations/20260812010100_local_user_seed';

const databaseUrl = process.env.DATABASE_URL;
const schemaName = `knowledge_schema_test_${process.pid}`;
const schemaMigrationName = '20260812010000_identity_knowledge_schema';
const seedMigrationName = '20260812010100_local_user_seed';
const trashIndexesMigrationName = '20260817000000_trash_retention_indexes';
const otherUserId = '10000000-0000-4000-8000-000000000001';
const firstKnowledgeBaseId = '20000000-0000-4000-8000-000000000001';
const secondKnowledgeBaseId = '20000000-0000-4000-8000-000000000002';
const otherKnowledgeBaseId = '20000000-0000-4000-8000-000000000003';
const parentDocumentId = '30000000-0000-4000-8000-000000000001';
let database: Kysely<DatabaseSchema>;

/** 用于设置连接级搜索路径且不读取或修改凭据。 */
function createScopedDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set('options', `-csearch_path=${schemaName}`);
  return url.toString();
}

/** 用于创建隔离 Schema 及限定 DDL 作用域的客户端。 */
async function prepareDatabase(): Promise<void> {
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.createSchema(schemaName).execute();
  await adminDatabase.destroy();
  database = await createDatabaseClient(createScopedDatabaseUrl(databaseUrl!));
}

/** 用于删除全部测试关系并释放连接池。 */
async function cleanDatabase(): Promise<void> {
  await database.destroy();
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.dropSchema(schemaName).cascade().execute();
  await adminDatabase.destroy();
}

/** 用于在隔离 Schema 中创建确定的 Kysely 元数据名称。 */
function migrationOptions(direction: 'down' | 'up') {
  return {
    direction,
    migrationLockTableName: 'migration_lock',
    migrationTableName: 'migration_history',
    migrationTableSchema: schemaName,
  } as const;
}

/** 用于构造带可选父级和知识库的有效文档行。 */
function documentValues(
  id: string,
  ownerId: string,
  knowledgeBaseId: string,
  parentId: string | null,
): Insertable<DocumentTable> {
  return {
    id,
    owner_id: ownerId,
    knowledge_base_id: knowledgeBaseId,
    parent_id: parentId,
    path: `/${id}`,
    position: 0,
    title: '测试文档',
    deleted_at: null,
    deleted_parent_id: null,
    deleted_position: null,
  };
}

/** 用于写入约束检查所需的所有者和知识库夹具。 */
async function insertConstraintFixtures(): Promise<void> {
  await database
    .insertInto('users')
    .values({ id: otherUserId, display_name: '其他用户', timezone: 'Asia/Shanghai' })
    .execute();
  await database
    .insertInto('knowledge_bases')
    .values([
      createKnowledgeBase(firstKnowledgeBaseId, LOCAL_USER_ID),
      createKnowledgeBase(secondKnowledgeBaseId, LOCAL_USER_ID),
      createKnowledgeBase(otherKnowledgeBaseId, otherUserId),
    ])
    .execute();
  await database
    .insertInto('documents')
    .values(documentValues(parentDocumentId, LOCAL_USER_ID, firstKnowledgeBaseId, null))
    .execute();
}

/** 用于构造最小有效知识库写入结构。 */
function createKnowledgeBase(id: string, ownerId: string) {
  return {
    id,
    owner_id: ownerId,
    name: `知识库 ${id.at(-1)}`,
    kind: 'normal' as const,
    deleted_at: null,
  };
}

/** 用于验证预期关系和唯一稳定本地身份。 */
async function expectSchemaAndSeed(): Promise<void> {
  const tables = await database.introspection.getTables();
  const names = tables.filter((table) => table.schema === schemaName).map((table) => table.name);
  expect(names).toEqual(
    expect.arrayContaining([
      'users',
      'knowledge_bases',
      'documents',
      'document_revisions',
      'inbox_items',
      'idempotency_records',
    ]),
  );
  const seed = await database
    .selectFrom('users')
    .select(({ fn }) => fn.countAll<number>().as('count'))
    .where('id', '=', LOCAL_USER_ID)
    .executeTakeFirstOrThrow();
  expect(Number(seed.count)).toBe(1);
}

/** 用于验证受控类型、版本和 Inbox 状态约束。 */
async function expectControlledValuesRejected(): Promise<void> {
  const { sql } = await import('kysely');
  await expect(
    sql`INSERT INTO knowledge_bases (id, owner_id, name, kind, version)
        VALUES (${`40000000-0000-4000-8000-000000000001`}, ${LOCAL_USER_ID}, '非法类型', 'other', 1)`.execute(
      database,
    ),
  ).rejects.toThrow();
  await expect(
    sql`INSERT INTO knowledge_bases (id, owner_id, name, kind, version)
        VALUES (${`40000000-0000-4000-8000-000000000002`}, ${LOCAL_USER_ID}, '非法版本', 'normal', 0)`.execute(
      database,
    ),
  ).rejects.toThrow();
  await expect(
    sql`INSERT INTO inbox_items (id, owner_id, kind, content, status)
        VALUES (${`50000000-0000-4000-8000-000000000001`}, ${LOCAL_USER_ID}, 'text', '记录', 'done')`.execute(
      database,
    ),
  ).rejects.toThrow();
}

/** 用于验证文档所有权、父级范围和正文结构不变量。 */
async function expectDocumentConstraintsRejected(): Promise<void> {
  const crossOwner = documentValues(
    '30000000-0000-4000-8000-000000000002',
    otherUserId,
    otherKnowledgeBaseId,
    parentDocumentId,
  );
  const crossKnowledgeBase = documentValues(
    '30000000-0000-4000-8000-000000000003',
    LOCAL_USER_ID,
    secondKnowledgeBaseId,
    parentDocumentId,
  );
  const invalidContent = {
    ...documentValues(
      '30000000-0000-4000-8000-000000000004',
      LOCAL_USER_ID,
      firstKnowledgeBaseId,
      null,
    ),
    content_json: { type: 'paragraph' },
  };
  await expect(database.insertInto('documents').values(crossOwner).execute()).rejects.toThrow();
  await expect(
    database.insertInto('documents').values(crossKnowledgeBase).execute(),
  ).rejects.toThrow();
  await expect(database.insertInto('documents').values(invalidContent).execute()).rejects.toThrow();
}

/** 用于运行生产迁移往返并验证数据库不变量。 */
async function migratesIdentityAndKnowledgeSchema(): Promise<void> {
  const firstUp = await runMigrations(database, migrationOptions('up'));
  expect(firstUp.executedMigrations).toEqual([
    schemaMigrationName,
    seedMigrationName,
    trashIndexesMigrationName,
  ]);
  await expectSchemaAndSeed();
  expect((await runMigrations(database, migrationOptions('up'))).executedMigrations).toEqual([]);

  await insertConstraintFixtures();
  await expectControlledValuesRejected();
  await expectDocumentConstraintsRejected();

  await database.deleteFrom('documents').execute();
  await database.deleteFrom('knowledge_bases').execute();
  await database.deleteFrom('users').where('id', '=', otherUserId).execute();
  expect((await runMigrations(database, migrationOptions('down'))).executedMigrations).toEqual([
    trashIndexesMigrationName,
  ]);
  expect((await runMigrations(database, migrationOptions('down'))).executedMigrations).toEqual([
    seedMigrationName,
  ]);
  expect((await runMigrations(database, migrationOptions('down'))).executedMigrations).toEqual([
    schemaMigrationName,
  ]);
  expect((await runMigrations(database, migrationOptions('up'))).executedMigrations).toEqual([
    schemaMigrationName,
    seedMigrationName,
    trashIndexesMigrationName,
  ]);
}

/** 用于仅在配置 PostgreSQL 时注册生产 Schema 场景。 */
function defineSchemaMigrationTests(): void {
  beforeAll(prepareDatabase);
  afterAll(cleanDatabase);
  test('enforces the initial user-owned knowledge schema', migratesIdentityAndKnowledgeSchema);
}

describe.skipIf(databaseUrl === undefined)(
  'Identity and Knowledge schema migrations',
  defineSchemaMigrationTests,
);
