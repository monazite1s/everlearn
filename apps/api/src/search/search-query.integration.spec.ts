/** @fileoverview 在真实 PostgreSQL 与公开 HTTP 边界验证 SEARCH-02 查询语义。 */

import { randomUUID } from 'node:crypto';

import type { SearchResponse, SearchResultItem } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { sql } from 'kysely';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { DocumentsTestEnvironment, otherUserId } from '../../tests/documents-integration.support';
import { LOCAL_USER_ID } from '../identity/local-identity.constants';
import { decodeSearchCursor } from './search-query.dto';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(`search_query_${process.pid}`, databaseUrl ?? '');
const primaryBaseId = '52000000-0000-4000-8000-000000000001';
const secondaryBaseId = '52000000-0000-4000-8000-000000000002';
const deletedBaseId = '52000000-0000-4000-8000-000000000003';
const otherBaseId = '52000000-0000-4000-8000-000000000004';

/** 用于生成确定且满足 UUID 约束的文档标识。 */
function documentId(sequence: number): string {
  return `53000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
}

/** 用于生成确定且满足 UUID 约束的 Block 标识。 */
function blockId(sequence: number): string {
  return `54000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
}

interface SearchDocumentFixture {
  readonly deleted?: boolean;
  readonly documentVersion?: number;
  readonly indexedVersion?: number;
  readonly knowledgeBaseId?: string;
  readonly ownerId?: string;
  readonly sequence: number;
  readonly text?: string;
  readonly title: string;
  readonly updatedAt?: string;
}

/** 用于写入当前文档与可选搜索投影，测试不经过异步 Worker。 */
async function insertSearchDocument(fixture: SearchDocumentFixture): Promise<void> {
  const id = documentId(fixture.sequence);
  const ownerId = fixture.ownerId ?? LOCAL_USER_ID;
  const version = fixture.documentVersion ?? 1;
  await environment.insertDocuments([
    {
      ...(fixture.deleted === undefined ? {} : { deleted: fixture.deleted }),
      id,
      knowledgeBaseId: fixture.knowledgeBaseId ?? primaryBaseId,
      ownerId,
      position: fixture.sequence,
      title: fixture.title,
    },
  ]);
  await sql`UPDATE documents SET version = ${version}, updated_at = ${fixture.updatedAt ?? '2026-08-25T00:00:00Z'}::timestamptz
    WHERE id = ${id}::uuid`.execute(environment.getDatabase());
  if (fixture.indexedVersion === undefined) return;
  await sql`INSERT INTO search_document_projections
      (document_id, owner_id, indexed_document_version, indexed_content_hash)
    VALUES (${id}::uuid, ${ownerId}::uuid, ${fixture.indexedVersion}, ${'a'.repeat(64)})`.execute(
    environment.getDatabase(),
  );
  if (fixture.text === undefined) return;
  await sql`INSERT INTO search_blocks
      (id, owner_id, document_id, document_version, block_id, block_order, text, heading_path, content_hash)
    VALUES (${randomUUID()}::uuid, ${ownerId}::uuid, ${id}::uuid, ${fixture.indexedVersion},
      ${blockId(fixture.sequence)}::uuid, 0, ${fixture.text}, ARRAY['章节'], ${'b'.repeat(64)})`.execute(
    environment.getDatabase(),
  );
}

/** 用于请求搜索并返回已通过状态断言的共享契约。 */
async function search(query: Record<string, unknown>): Promise<SearchResponse> {
  const response = await request(environment.getHttpServer()).get('/api/v1/search').query(query);
  expect(response.status).toBe(200);
  return environment.parseBody<SearchResponse>(response);
}

/** 用于验证固定六级排序、文档去重和普通 keyset 连续分页。 */
async function returnsFixedTiersWithStablePagination(): Promise<void> {
  const fixtures: readonly SearchDocumentFixture[] = [
    { indexedVersion: 1, sequence: 1, title: 'outbox' },
    { indexedVersion: 1, sequence: 2, title: 'outbox patterns' },
    { indexedVersion: 1, sequence: 3, title: 'reliable outbox guide' },
    { indexedVersion: 1, sequence: 4, title: 'preoutboxpost' },
    { indexedVersion: 1, sequence: 5, text: 'transactional outbox', title: '正文 FTS' },
    { indexedVersion: 1, sequence: 6, text: 'preoutboxpost', title: '正文字面' },
  ];
  for (const fixture of fixtures) await insertSearchDocument(fixture);

  const seen: SearchResultItem[] = [];
  let cursor: string | null = null;
  do {
    const page = await search({
      ...(cursor === null ? {} : { cursor }),
      limit: 2,
      query: 'OUTBOX',
    });
    seen.push(...page.items);
    cursor = page.nextCursor;
    if (cursor !== null) expect(decodeSearchCursor(cursor)?.rankScore).toMatch(/^\d+\.\d{6}$/u);
  } while (cursor !== null);

  expect(seen.map(({ documentId: id }) => id)).toEqual(
    fixtures.map(({ sequence }) => documentId(sequence)),
  );
  expect(new Set(seen.map(({ documentId: id }) => id)).size).toBe(6);
  expect(seen[0]).toMatchObject({ blockId: null, matchedField: 'title' });
  expect(seen[4]).toMatchObject({ blockId: blockId(5), matchedField: 'content' });
}

/** 用于验证标题与正文同时命中时只返回一项并定位最佳正文块。 */
async function returnsBothWithSafeSegments(): Promise<void> {
  const longText = `${'前'.repeat(200)}<script>outbox</script>${'后'.repeat(200)}`;
  const lowerTieBlockId = '50000000-0000-4000-8000-000000000010';
  await insertSearchDocument({
    indexedVersion: 1,
    sequence: 10,
    text: longText,
    title: `<img onerror=alert(1)> ${'outbox '.repeat(20).trim()}`,
  });
  await sql`INSERT INTO search_blocks
      (id, owner_id, document_id, document_version, block_id, block_order, text, heading_path, content_hash)
    VALUES (${randomUUID()}::uuid, ${LOCAL_USER_ID}::uuid, ${documentId(10)}::uuid, 1,
      ${lowerTieBlockId}::uuid, 0, ${longText}, ARRAY[${'章'.repeat(201)}], ${'c'.repeat(64)})`.execute(
    environment.getDatabase(),
  );
  const response = await search({ query: 'outbox' });
  expect(response.items).toHaveLength(1);
  const item = response.items[0];
  expect(item).toMatchObject({ blockId: lowerTieBlockId, matchedField: 'both' });
  expect(item?.titleSegments.map(({ text }) => text).join('')).toContain('<img onerror=alert(1)>');
  expect(item?.titleSegments.some(({ highlighted }) => highlighted)).toBe(true);
  expect(item?.titleSegments.filter(({ highlighted }) => highlighted)).toHaveLength(16);
  if (item?.contentSnippet === null || item?.contentSnippet === undefined)
    throw new Error('Expected content snippet');
  expect(item.contentSnippet.segments.map(({ text }) => text).join('')).toContain('<script>');
  expect(Array.from(item.contentSnippet.segments.map(({ text }) => text).join(''))).toHaveLength(
    240,
  );
  expect(item.contentSnippet).toMatchObject({ leadingTruncated: true, trailingTruncated: true });
  expect(Array.from(item.headingPath[0] ?? '')).toHaveLength(200);
  expect(JSON.stringify(item)).not.toContain('highlightHtml');
}

/** 用于验证中文正文、当前版本和范围级索引状态。 */
async function enforcesCurrentVersionAndIndexStatus(): Promise<void> {
  await insertSearchDocument({
    documentVersion: 2,
    indexedVersion: 1,
    sequence: 20,
    text: '分布式系统中的幂等设计',
    title: '幂等架构',
  });
  let response = await search({ field: 'content', query: '幂等' });
  expect(response).toMatchObject({ indexStatus: 'updating', items: [] });
  await sql`UPDATE search_document_projections SET indexed_document_version = 2
    WHERE document_id = ${documentId(20)}::uuid`.execute(environment.getDatabase());
  await sql`UPDATE search_blocks SET document_version = 2
    WHERE document_id = ${documentId(20)}::uuid`.execute(environment.getDatabase());
  response = await search({ field: 'content', query: '幂等' });
  expect(response.indexStatus).toBe('ready');
  expect(response.items[0]).toMatchObject({ blockId: blockId(20), matchedField: 'content' });
  expect(response.items[0]?.titleSegments.every(({ highlighted }) => !highlighted)).toBe(true);
  await insertSearchDocument({ sequence: 21, title: '幂等实践' });
  response = await search({ field: 'title', query: '幂等' });
  expect(response.indexStatus).toBe('ready');
  expect(response.items.map(({ matchedField }) => matchedField)).toEqual(['title', 'title']);
}

/** 用于验证祖先公开链只保留根与最近七级且不暴露物化 path。 */
async function returnsBoundedPublicAncestors(): Promise<void> {
  const pathIds: string[] = [];
  for (let sequence = 40; sequence < 50; sequence += 1) {
    const id = documentId(sequence);
    pathIds.push(id);
    await environment.insertDocuments([
      {
        ...(sequence === 40 ? {} : { childOf: documentId(sequence - 1) }),
        id,
        knowledgeBaseId: primaryBaseId,
        path: `/${pathIds.join('/')}`,
        position: sequence,
        title: sequence === 49 ? 'ancestor query' : `祖先 ${sequence}`,
      },
    ]);
  }
  const response = await search({ field: 'title', query: 'ancestor' });
  const item = response.items[0];
  expect(item?.pathTruncated).toBe(true);
  expect(item?.ancestors).toHaveLength(8);
  expect(item?.ancestors.map(({ documentId: id }) => id)).toEqual([
    documentId(40),
    ...Array.from({ length: 7 }, (_, index) => documentId(42 + index)),
  ]);
  expect(item).not.toHaveProperty('path');
}

/** 用于验证所有者、两层生命周期、当前库范围和严格更新时间过滤。 */
async function filtersAuthorizationLifecycleAndScope(): Promise<void> {
  const fixtures: readonly SearchDocumentFixture[] = [
    { indexedVersion: 1, sequence: 30, title: 'scope match', updatedAt: '2026-08-25T00:00:00Z' },
    { indexedVersion: 1, sequence: 31, title: 'scope match', updatedAt: '2026-08-25T00:00:01Z' },
    { indexedVersion: 1, knowledgeBaseId: secondaryBaseId, sequence: 32, title: 'scope match' },
    { deleted: true, indexedVersion: 1, sequence: 33, title: 'scope match' },
    { indexedVersion: 1, knowledgeBaseId: deletedBaseId, sequence: 34, title: 'scope match' },
    {
      indexedVersion: 1,
      knowledgeBaseId: otherBaseId,
      ownerId: otherUserId,
      sequence: 35,
      title: 'scope match',
    },
  ];
  for (const fixture of fixtures) await insertSearchDocument(fixture);
  const response = await search({
    knowledgeBaseId: primaryBaseId,
    query: 'scope',
    scope: 'knowledgeBase',
    updatedAfter: '2026-08-25T00:00:00Z',
  });
  expect(response.items.map(({ documentId: id }) => id)).toEqual([documentId(31)]);
}

/** 用于验证 LIKE 元字符只按用户提交的字面文本匹配。 */
async function treatsLiteralMetacharactersAsText(): Promise<void> {
  await insertSearchDocument({ indexedVersion: 1, sequence: 36, title: '100%_verified' });
  await insertSearchDocument({ indexedVersion: 1, sequence: 37, title: 'ordinary title' });
  const percent = await search({ field: 'title', query: '%' });
  const underscore = await search({ field: 'title', query: '_' });
  expect(percent.items.map(({ documentId: id }) => id)).toEqual([documentId(36)]);
  expect(underscore.items.map(({ documentId: id }) => id)).toEqual([documentId(36)]);
}

/** 用于验证非法参数和不可访问范围不会泄露资源存在性。 */
async function rejectsInvalidAndInaccessibleQueries(): Promise<void> {
  const invalidQueries: readonly Record<string, unknown>[] = [
    {},
    { query: '   ' },
    { query: ['x', 'y'] },
    { knowledgeBaseId: primaryBaseId, query: 'x', scope: 'all' },
    { query: 'x', scope: 'knowledgeBase' },
    { field: 'tags', query: 'x' },
    { query: 'x', unknown: 'rejected' },
  ];
  for (const query of invalidQueries) {
    const response = await request(environment.getHttpServer()).get('/api/v1/search').query(query);
    const error = environment.expectApiError(
      response,
      400,
      'VALIDATION_FAILED',
      '请求参数校验失败。',
    );
    expect(error.details).toHaveProperty('fields');
  }
  await insertSearchDocument({ indexedVersion: 1, sequence: 60, title: 'cursor match' });
  await insertSearchDocument({ indexedVersion: 1, sequence: 61, title: 'cursor match' });
  const firstPage = await search({ limit: 1, query: 'cursor' });
  const changedQuery = await request(environment.getHttpServer())
    .get('/api/v1/search')
    .query({ cursor: firstPage.nextCursor, limit: 1, query: 'changed' });
  const cursorError = environment.expectApiError(
    changedQuery,
    400,
    'VALIDATION_FAILED',
    '请求参数校验失败。',
  );
  expect((cursorError.details as { fields: unknown[] }).fields).toEqual(
    expect.arrayContaining([expect.objectContaining({ field: 'cursor' })]),
  );
  for (const id of [deletedBaseId, otherBaseId, documentId(99)]) {
    const response = await request(environment.getHttpServer())
      .get('/api/v1/search')
      .query({ knowledgeBaseId: id, query: 'secret', scope: 'knowledgeBase' });
    environment.expectApiError(response, 404, 'NOT_FOUND', '请求的资源不存在或不可访问。');
    expect(response.text).not.toContain('他人库');
  }
}

/** 用于批量写入 50k 当前文档、投影和正文块的生产查询预算夹具。 */
async function insertSearchPerformanceFixtures(): Promise<void> {
  await sql`INSERT INTO documents
      (id, owner_id, knowledge_base_id, parent_id, path, position, title, updated_at)
    SELECT document_id::uuid, ${LOCAL_USER_ID}::uuid, ${primaryBaseId}::uuid, NULL,
      '/' || document_id, sequence, '性能文档 ' || sequence::text,
      TIMESTAMPTZ '2026-01-01T00:00:00Z' + sequence * interval '1 second'
    FROM (SELECT sequence, '58000000-0000-4000-8000-' || lpad(sequence::text, 12, '0') document_id
      FROM generate_series(1, 50000) sequence) fixtures`.execute(environment.getDatabase());
  await sql`INSERT INTO search_document_projections
      (document_id, owner_id, indexed_document_version, indexed_content_hash)
    SELECT id, owner_id, version, ${'a'.repeat(64)} FROM documents
    WHERE knowledge_base_id = ${primaryBaseId}::uuid`.execute(environment.getDatabase());
  await sql`INSERT INTO search_blocks
      (id, owner_id, document_id, document_version, block_id, block_order, text, heading_path, content_hash)
    SELECT ('59000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
      ${LOCAL_USER_ID}::uuid, document_id::uuid, 1,
      ('5a000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid, 0,
      CASE sequence WHEN 1 THEN 'transactional outbox'
        WHEN 2 THEN '分布式系统中的幂等设计'
        ELSE 'ordinary reference content ' || sequence::text END,
      '{}'::text[], ${'b'.repeat(64)}
    FROM (SELECT sequence, '58000000-0000-4000-8000-' || lpad(sequence::text, 12, '0') document_id
      FROM generate_series(1, 50000) sequence) fixtures`.execute(environment.getDatabase());
  await sql`ANALYZE documents`.execute(environment.getDatabase());
  await sql`ANALYZE search_document_projections`.execute(environment.getDatabase());
  await sql`ANALYZE search_blocks`.execute(environment.getDatabase());
}

/** 用于验证 50k 本机夹具的三类真实公开首屏查询均不超过 300ms。 */
async function meetsProductionQueryBudget(): Promise<void> {
  await insertSearchPerformanceFixtures();
  const cases = [
    { documentId: documentId(2).replace('53000000', '58000000'), query: '幂' },
    { documentId: documentId(2).replace('53000000', '58000000'), query: '幂等设计' },
    { documentId: documentId(1).replace('53000000', '58000000'), query: 'outbox' },
  ] as const;
  for (const scenario of cases) {
    const startedAt = performance.now();
    const response = await request(environment.getHttpServer())
      .get('/api/v1/search')
      .query({ limit: 20, query: scenario.query });
    const elapsedMilliseconds = performance.now() - startedAt;
    expect(response.status).toBe(200);
    const body = environment.parseBody<SearchResponse>(response);
    expect(body.items[0]?.documentId).toBe(scenario.documentId);
    expect(elapsedMilliseconds, `50k 生产路径查询 ${scenario.query}`).toBeLessThanOrEqual(300);
  }
}

/** 用于注册真实数据库、所有者与 HTTP 场景。 */
function defineSearchQueryIntegrationTests(): void {
  beforeAll(async () => {
    await environment.prepareApplication();
    await environment.insertOtherUser();
  }, 30_000);
  beforeEach(async () => {
    await environment.resetFixtures();
    await environment.insertOtherUser();
    await environment.insertKnowledgeBases([
      { id: primaryBaseId, name: '主库' },
      { id: secondaryBaseId, name: '第二库' },
      { deletedAt: new Date(), id: deletedBaseId, name: '已删库' },
      { id: otherBaseId, name: '他人库', ownerId: otherUserId },
    ]);
  });
  afterAll(() => environment.releaseApplication());
  test('returns fixed tiers with stable pagination', returnsFixedTiersWithStablePagination);
  test('returns both matches with safe text segments', returnsBothWithSafeSegments);
  test('enforces current version and index status', enforcesCurrentVersionAndIndexStatus);
  test('filters authorization lifecycle and scope', filtersAuthorizationLifecycleAndScope);
  test('treats literal metacharacters as text', treatsLiteralMetacharactersAsText);
  test('returns bounded public ancestors', returnsBoundedPublicAncestors);
  test('rejects invalid and inaccessible queries', rejectsInvalidAndInaccessibleQueries);
  test('meets 50k production query budget', meetsProductionQueryBudget, 30_000);
}

describe.skipIf(databaseUrl === undefined)(
  'public search query',
  defineSearchQueryIntegrationTests,
);
