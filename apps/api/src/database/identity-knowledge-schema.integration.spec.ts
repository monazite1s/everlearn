/** @fileoverview Verifies the production Identity and Knowledge migrations against PostgreSQL. */

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
const otherUserId = '10000000-0000-4000-8000-000000000001';
const firstKnowledgeBaseId = '20000000-0000-4000-8000-000000000001';
const secondKnowledgeBaseId = '20000000-0000-4000-8000-000000000002';
const otherKnowledgeBaseId = '20000000-0000-4000-8000-000000000003';
const parentDocumentId = '30000000-0000-4000-8000-000000000001';
let database: Kysely<DatabaseSchema>;

/** Adds a per-connection search path without exposing or altering credentials. */
function createScopedDatabaseUrl(connectionString: string): string {
  const url = new URL(connectionString);
  url.searchParams.set('options', `-csearch_path=${schemaName}`);
  return url.toString();
}

/** Creates an isolated schema and a client whose unqualified DDL is scoped to it. */
async function prepareDatabase(): Promise<void> {
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.createSchema(schemaName).execute();
  await adminDatabase.destroy();
  database = await createDatabaseClient(createScopedDatabaseUrl(databaseUrl!));
}

/** Removes all test relations and releases both connection pools. */
async function cleanDatabase(): Promise<void> {
  await database.destroy();
  const adminDatabase = await createDatabaseClient(databaseUrl!);
  await adminDatabase.schema.dropSchema(schemaName).cascade().execute();
  await adminDatabase.destroy();
}

/** Creates deterministic Kysely metadata names inside the isolated schema. */
function migrationOptions(direction: 'down' | 'up') {
  return {
    direction,
    migrationLockTableName: 'migration_lock',
    migrationTableName: 'migration_history',
    migrationTableSchema: schemaName,
  } as const;
}

/** Returns one valid document row with an optional parent and knowledge base. */
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

/** Seeds owner and knowledge-base fixtures used only by constraint checks. */
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

/** Returns the minimum valid knowledge-base insert shape. */
function createKnowledgeBase(id: string, ownerId: string) {
  return {
    id,
    owner_id: ownerId,
    name: `知识库 ${id.at(-1)}`,
    kind: 'normal' as const,
    deleted_at: null,
  };
}

/** Verifies all expected relations and exactly one stable local identity. */
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

/** Verifies controlled kind, version, and Inbox status constraints. */
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

/** Verifies document ownership, parent scope, and content-shape invariants. */
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

/** Runs production up/repeat/down/up and all required database invariants. */
async function migratesIdentityAndKnowledgeSchema(): Promise<void> {
  const firstUp = await runMigrations(database, migrationOptions('up'));
  expect(firstUp.executedMigrations).toEqual([schemaMigrationName, seedMigrationName]);
  await expectSchemaAndSeed();
  expect((await runMigrations(database, migrationOptions('up'))).executedMigrations).toEqual([]);

  await insertConstraintFixtures();
  await expectControlledValuesRejected();
  await expectDocumentConstraintsRejected();

  await database.deleteFrom('documents').execute();
  await database.deleteFrom('knowledge_bases').execute();
  await database.deleteFrom('users').where('id', '=', otherUserId).execute();
  expect((await runMigrations(database, migrationOptions('down'))).executedMigrations).toEqual([
    seedMigrationName,
  ]);
  expect((await runMigrations(database, migrationOptions('down'))).executedMigrations).toEqual([
    schemaMigrationName,
  ]);
  expect((await runMigrations(database, migrationOptions('up'))).executedMigrations).toEqual([
    schemaMigrationName,
    seedMigrationName,
  ]);
}

/** Registers the production schema migration scenario when PostgreSQL is configured. */
function defineSchemaMigrationTests(): void {
  beforeAll(prepareDatabase);
  afterAll(cleanDatabase);
  test('enforces the initial user-owned knowledge schema', migratesIdentityAndKnowledgeSchema);
}

describe.skipIf(databaseUrl === undefined)(
  'Identity and Knowledge schema migrations',
  defineSchemaMigrationTests,
);
