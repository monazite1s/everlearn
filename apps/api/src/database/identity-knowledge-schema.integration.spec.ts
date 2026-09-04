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
const revisionTitleMigrationName = '20260818000000_document_revision_title';
const attachmentsMigrationName = '20260819000000_attachments';
const searchProjectionMigrationName = '20260824000000_search_projection';
const searchQueryIndexesMigrationName = '20260825000000_search_query_indexes';
const workflowRuntimeMigrationName = '20260901000000_workflow_runtime';
const newsSchemaMigrationName = '20260902000000_news_schema';
const tagsLinksMigrationName = '20260903000000_document_tags_links';
const newsRunDetailsMigrationName = '20260905000000_news_run_details';
const tutorialSchemaMigrationName = '20260906000000_tutorial_schema';
const searchEmbeddingsMigrationName = '20260904000000_search_embeddings';
const fullMigrationNames = [
  schemaMigrationName,
  seedMigrationName,
  trashIndexesMigrationName,
  revisionTitleMigrationName,
  attachmentsMigrationName,
  searchProjectionMigrationName,
  searchQueryIndexesMigrationName,
  workflowRuntimeMigrationName,
  newsSchemaMigrationName,
  tagsLinksMigrationName,
  searchEmbeddingsMigrationName,
  newsRunDetailsMigrationName,
  tutorialSchemaMigrationName,
];
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

/** 用于断言一次迁移命令只执行指定迁移。 */
async function expectSingleMigration(direction: 'down' | 'up', name: string): Promise<void> {
  const result = await runMigrations(database, migrationOptions(direction));
  expect(result.executedMigrations).toEqual([name]);
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
      'attachments',
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

/** 用于验证附件受控类型、大小、哈希格式与生命周期不变量。 */
async function expectAttachmentConstraintsRejected(): Promise<void> {
  const { sql } = await import('kysely');
  const base = {
    file_name: '图片.png',
    id: '60000000-0000-4000-8000-000000000001',
    kind: 'image',
    mime_type: 'image/png',
    object_key: 'attachments/60000000-0000-4000-8000-000000000001',
    owner_id: LOCAL_USER_ID,
    size_bytes: 1024,
  };
  await expect(
    sql`INSERT INTO attachments (id, owner_id, object_key, file_name, mime_type, kind, size_bytes, status, reference_count)
        VALUES (${base.id}, ${base.owner_id}, ${base.object_key}, ${base.file_name}, ${base.mime_type}, 'video', ${1024n}, 'pending', 0)`.execute(
      database,
    ),
  ).rejects.toThrow();
  await expect(
    sql`INSERT INTO attachments (id, owner_id, object_key, file_name, mime_type, kind, size_bytes, status, reference_count)
        VALUES (${`60000000-0000-4000-8000-000000000002`}, ${base.owner_id}, ${base.object_key}, ${base.file_name}, ${base.mime_type}, 'image', ${26214401n}, 'pending', 0)`.execute(
      database,
    ),
  ).rejects.toThrow();
  await expect(
    sql`INSERT INTO attachments (id, owner_id, object_key, file_name, mime_type, kind, size_bytes, status, reference_count)
        VALUES (${`60000000-0000-4000-8000-000000000003`}, ${base.owner_id}, ${base.object_key}, ${base.file_name}, ${base.mime_type}, 'image', ${1024n}, 'pending', 1)`.execute(
      database,
    ),
  ).rejects.toThrow();
  await expect(
    sql`INSERT INTO attachments (id, owner_id, object_key, file_name, mime_type, kind, size_bytes, sha256, status, reference_count)
        VALUES (${`60000000-0000-4000-8000-000000000004`}, ${base.owner_id}, ${base.object_key}, ${base.file_name}, ${base.mime_type}, 'image', ${1024n}, ${'not-a-hash'}, 'pending', 0)`.execute(
      database,
    ),
  ).rejects.toThrow();
}

/** 用于运行生产迁移往返并验证数据库不变量。 */
async function migratesIdentityAndKnowledgeSchema(): Promise<void> {
  const firstUp = await runMigrations(database, migrationOptions('up'));
  expect(firstUp.executedMigrations).toEqual(fullMigrationNames);
  await expectSchemaAndSeed();
  expect((await runMigrations(database, migrationOptions('up'))).executedMigrations).toEqual([]);

  await insertConstraintFixtures();
  await expectControlledValuesRejected();
  await expectDocumentConstraintsRejected();
  await expectAttachmentConstraintsRejected();

  await database.deleteFrom('documents').execute();
  await database.deleteFrom('knowledge_bases').execute();
  await database.deleteFrom('users').where('id', '=', otherUserId).execute();
  await expectSingleMigration('down', tutorialSchemaMigrationName);
  await expectSingleMigration('down', newsRunDetailsMigrationName);
  await expectSingleMigration('down', searchEmbeddingsMigrationName);
  await expectSingleMigration('down', tagsLinksMigrationName);
  await expectSingleMigration('down', newsSchemaMigrationName);
  await expectSingleMigration('down', workflowRuntimeMigrationName);
  await expectSingleMigration('down', searchQueryIndexesMigrationName);
  await expectSingleMigration('down', searchProjectionMigrationName);
  await expectSingleMigration('down', attachmentsMigrationName);
  await expectSingleMigration('down', revisionTitleMigrationName);
  await expectSingleMigration('down', trashIndexesMigrationName);
  await expectSingleMigration('down', seedMigrationName);
  await expectSingleMigration('down', schemaMigrationName);
  expect((await runMigrations(database, migrationOptions('up'))).executedMigrations).toEqual(
    fullMigrationNames,
  );
}

/** 用于把迁移回退到修订标题之前以构造存量行夹具。 */
async function downToBeforeRevisionTitle(): Promise<void> {
  await expectSingleMigration('down', tutorialSchemaMigrationName);
  await expectSingleMigration('down', newsRunDetailsMigrationName);
  await expectSingleMigration('down', searchEmbeddingsMigrationName);
  await expectSingleMigration('down', tagsLinksMigrationName);
  await expectSingleMigration('down', newsSchemaMigrationName);
  await expectSingleMigration('down', workflowRuntimeMigrationName);
  await expectSingleMigration('down', searchQueryIndexesMigrationName);
  await expectSingleMigration('down', searchProjectionMigrationName);
  await expectSingleMigration('down', attachmentsMigrationName);
}

/** 用于验证修订标题迁移按文档标题回填存量修订行。 */
async function backfillsRevisionTitlesFromDocuments(): Promise<void> {
  await downToBeforeRevisionTitle();
  expect((await runMigrations(database, migrationOptions('down'))).executedMigrations).toEqual([
    revisionTitleMigrationName,
  ]);
  const documentId = '30000000-0000-4000-8000-000000000010';
  await database
    .insertInto('knowledge_bases')
    .values({ id: firstKnowledgeBaseId, kind: 'normal', name: '回填库', owner_id: LOCAL_USER_ID })
    .execute();
  await database
    .insertInto('documents')
    .values(documentValues(documentId, LOCAL_USER_ID, firstKnowledgeBaseId, null))
    .execute();
  const legacyRevision = {
    content_json: { content: [], type: 'doc' },
    created_by: LOCAL_USER_ID,
    document_id: documentId,
    id: '30000000-0000-4000-8000-000000000011',
    owner_id: LOCAL_USER_ID,
    plain_text: '',
    revision_number: 1,
    schema_version: 1,
    source: 'manual',
  };
  // 该夹具模拟 title 迁移前的存量行，此时列尚不存在，绕过迁移后类型收敛。
  await database
    .insertInto('document_revisions')
    .values(legacyRevision as never)
    .execute();

  expect((await runMigrations(database, migrationOptions('up'))).executedMigrations).toEqual(
    fullMigrationNames.slice(3),
  );
  const revision = await database
    .selectFrom('document_revisions')
    .select(['title'])
    .where('id', '=', '30000000-0000-4000-8000-000000000011')
    .executeTakeFirstOrThrow();
  expect(revision.title).toBe('测试文档');

  await database.deleteFrom('documents').execute();
  await database.deleteFrom('knowledge_bases').execute();
}

/** 用于仅在配置 PostgreSQL 时注册生产 Schema 场景。 */
function defineSchemaMigrationTests(): void {
  beforeAll(prepareDatabase);
  afterAll(cleanDatabase);
  test('enforces the initial user-owned knowledge schema', migratesIdentityAndKnowledgeSchema);
  test('backfills revision titles from documents', backfillsRevisionTitlesFromDocuments);
}

describe.skipIf(databaseUrl === undefined)(
  'Identity and Knowledge schema migrations',
  defineSchemaMigrationTests,
);
