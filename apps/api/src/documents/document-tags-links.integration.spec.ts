/** @fileoverview 在真实 PostgreSQL 验证标签设置幂等、链接重建、反链所有权与标签搜索过滤。 */

import { createDatabaseClient } from '../database/database.service';
import { runMigrations } from '../database/migration-runner';
import { DocumentsTestEnvironment, otherUserId } from '../../tests/documents-integration.support';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database/database.types';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(
  `doc_tags_links_${process.pid}`,
  databaseUrl ?? '',
);
const knowledgeBaseId = '62000000-0000-4000-8000-000000000001';
const otherBaseId = '62000000-0000-4000-8000-000000000002';

/** 用于生成确定文档标识。 */
function documentId(sequence: number): string {
  return `71000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
}

/** 用于生成确定 blockId。 */
function blockId(sequence: number): string {
  return `81000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
}

/** 用于列出隔离 Schema 下的表名。 */
async function listTables(
  database: Kysely<DatabaseSchema>,
  schemaName: string,
): Promise<{ tablename: string }[]> {
  const { sql } = await import('kysely');
  const result = await sql<{ tablename: string }>`
    SELECT tablename FROM pg_tables WHERE schemaname = ${schemaName}
  `.execute(database);
  return result.rows;
}

/** 用于创建独立迁移 Schema 并执行指定方向的全部迁移。 */
async function migrateIsolatedSchema(direction: 'up' | 'down'): Promise<string[]> {
  const schemaName = `tags_migration_${process.pid}`;
  const adminDatabase = await createDatabaseClient(databaseUrl ?? '');
  if (direction === 'up') await adminDatabase.schema.createSchema(schemaName).execute();
  const url = new URL(databaseUrl ?? '');
  url.searchParams.set('options', `-csearch_path=${schemaName}`);
  const database = await createDatabaseClient(url.toString());
  await runMigrations(database, {
    direction,
    migrationLockTableName: 'migration_lock',
    migrationTableName: 'migration_history',
    migrationTableSchema: schemaName,
  });
  const tables = await listTables(database, schemaName);
  await database.destroy();
  if (direction === 'down') {
    await adminDatabase.schema.dropSchema(schemaName).cascade().execute();
  }
  await adminDatabase.destroy();
  return tables.map((row) => row.tablename);
}

/** 用于经 HTTP 创建文档并返回标识。 */
async function createDocument(title: string): Promise<{ id: string; version: number }> {
  const response = await request(environment.getHttpServer())
    .post(`/api/v1/knowledge-bases/${knowledgeBaseId}/documents`)
    .send({ title });
  expect(response.status).toBe(201);
  return environment.parseBody(response);
}

/** 用于提交一次正文保存，正文第一段带可配置的 docLink。 */
async function saveContent(id: string, version: number, targets: readonly string[]): Promise<void> {
  const content = {
    content: [
      {
        attrs: { blockId: blockId(1) },
        content: targets.map((target, index) => ({
          marks: [{ attrs: { documentId: target }, type: 'docLink' }],
          text: `链接${index}`,
          type: 'text',
        })),
        type: 'paragraph',
      },
    ],
    type: 'doc',
  };
  const response = await request(environment.getHttpServer())
    .patch(`/api/v1/documents/${id}/content`)
    .send({ contentJson: content, schemaVersion: 1, version });
  expect(response.status).toBe(200);
}

/** 用于读取指定文档的反链公开投影。 */
async function fetchBacklinks(
  targetId: string,
): Promise<{ blockId: string | null; documentId: string }[]> {
  const response = await request(environment.getHttpServer()).get(
    `/api/v1/documents/${targetId}/backlinks`,
  );
  return environment.parseBody<{ items: { blockId: string | null; documentId: string }[] }>(
    response,
  ).items;
}

/** 用于整体设置文档标签并断言请求成功。 */
async function putTags(id: string, names: string[]): Promise<{ id: string; name: string }[]> {
  const response = await request(environment.getHttpServer())
    .put(`/api/v1/documents/${id}/tags`)
    .send({ names });
  expect(response.status).toBe(200);
  return environment.parseBody<{ items: { id: string; name: string }[] }>(response).items;
}

beforeEach(async () => {
  await environment.resetFixtures();
  await environment.insertOtherUser();
  await environment.insertKnowledgeBases([
    { id: knowledgeBaseId, name: '标签库' },
    { id: otherBaseId, name: '他人库', ownerId: otherUserId },
  ]);
});

beforeAll(async () => {
  await environment.prepareApplication();
});

afterAll(async () => {
  await environment.releaseApplication();
});

describe('document tags and links migrations', () => {
  test('迁移 up 创建三张表，down 回退后再 up 恢复', async () => {
    const names = await migrateIsolatedSchema('up');
    expect(names).toContain('tags');
    expect(names).toContain('document_tags');
    expect(names).toContain('document_links');
    await migrateIsolatedSchema('down');
    const remaining = await migrateIsolatedSchema('up');
    expect(remaining).toContain('tags');
    expect(remaining).toContain('document_links');
  });
});

describe('document tags api', () => {
  test('整体设置标签幂等且未列出的关联被移除', async () => {
    const document = await createDocument('标签文档');
    await putTags(document.id, ['数据库', '前端']);
    const repeated = await putTags(document.id, ['数据库', '前端']);
    expect(repeated.map((tag) => tag.name)).toEqual(['前端', '数据库']);
    const ownerList = await request(environment.getHttpServer()).get('/api/v1/tags');
    expect(environment.parseBody<{ items: unknown[] }>(ownerList).items).toHaveLength(2);
    const afterRemoval = await putTags(document.id, ['数据库']);
    expect(afterRemoval.map((tag) => tag.name)).toEqual(['数据库']);
    const rows = await environment
      .getDatabase()
      .selectFrom('document_tags')
      .select('tag_id')
      .execute();
    expect(rows).toHaveLength(1);
  });
});

describe('document links api', () => {
  test('保存正文在事务内重建内部链接并重复保存可清空', async () => {
    const source = await createDocument('来源文档');
    const target = await createDocument('目标文档');
    await saveContent(source.id, source.version, [target.id, target.id]);
    const links = await fetchBacklinks(target.id);
    expect(links).toHaveLength(1);
    expect(links[0]?.documentId).toBe(source.id);
    expect(links[0]?.blockId).toBe(blockId(1));
    await saveContent(source.id, source.version + 1, []);
    expect(await fetchBacklinks(target.id)).toHaveLength(0);
  });

  test('他人文档的反链查询返回空且不泄露记录', async () => {
    await environment.insertDocuments([
      {
        id: documentId(1),
        knowledgeBaseId: otherBaseId,
        ownerId: otherUserId,
        position: 1,
        title: '他人目标',
      },
    ]);
    const response = await request(environment.getHttpServer()).get(
      `/api/v1/documents/${documentId(1)}/backlinks`,
    );
    expect(response.status).toBe(200);
    expect(environment.parseBody<{ items: unknown[] }>(response).items).toHaveLength(0);
  });
});

describe('search tag filter', () => {
  test('tagIds 过滤只返回命中任一标签的文档', async () => {
    const tagged = await createDocument('Alpha 报告');
    const untagged = await createDocument('Beta 报告');
    expect(untagged.id).toBeDefined();
    const [tag] = await putTags(tagged.id, ['周报']);
    expect(tag?.id).toBeDefined();
    const search = /** 用于按标题搜索两篇报告。 */ (extraQuery: string) =>
      request(environment.getHttpServer()).get(
        `/api/v1/search?query=%E6%8A%A5%E5%91%8A&field=title${extraQuery}`,
      );
    const all = await search('');
    expect(environment.parseBody<{ items: unknown[] }>(all).items).toHaveLength(2);
    const filtered = await search(`&tagIds=${tag?.id ?? ''}`);
    const items = environment.parseBody<{ items: { documentId: string }[] }>(filtered).items;
    expect(items).toHaveLength(1);
    expect(items[0]?.documentId).toBe(tagged.id);
  });
});
