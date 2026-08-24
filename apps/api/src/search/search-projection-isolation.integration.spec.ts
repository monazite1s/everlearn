/** @fileoverview 在真实 PostgreSQL 中验证 Search 投影严格保持事件所有者边界。 */

import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { DocumentsTestEnvironment, otherUserId } from '../../tests/documents-integration.support';
import { LOCAL_USER_ID } from '../identity/local-identity.constants';
import { SearchProjectionService } from './search-projection.service';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(
  `search_projection_owner_${process.pid}`,
  databaseUrl ?? '',
);
const localKnowledgeBaseId = '2a000000-0000-4000-8000-000000000001';
const otherKnowledgeBaseId = '2a000000-0000-4000-8000-000000000002';
const localDocumentId = '2a000000-0000-4000-8000-000000000003';
const otherDocumentId = '2a000000-0000-4000-8000-000000000004';

/** 用于构造带稳定引用块的单段正文。 */
function contentOf(sequence: number, text: string): object {
  return {
    content: [
      {
        attrs: { blockId: `2b000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}` },
        content: [{ text, type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  };
}

/** 用于写入所有者、知识库和正文均明确的文档夹具。 */
async function insertOwnedDocument(props: {
  content: object;
  documentId: string;
  knowledgeBaseId: string;
  ownerId: string;
}): Promise<void> {
  await environment.insertDocuments([
    {
      id: props.documentId,
      knowledgeBaseId: props.knowledgeBaseId,
      ownerId: props.ownerId,
      position: 0,
    },
  ]);
  await sql`UPDATE documents SET content_json = ${JSON.stringify(props.content)}::jsonb,
      plain_text = 'owner content', version = 1 WHERE id = ${props.documentId}::uuid`.execute(
    environment.getDatabase(),
  );
}

/** 用于追加一条指定所有者的保存事件。 */
async function insertSavedEvent(id: string, ownerId: string, documentId: string): Promise<void> {
  const payload = {
    contentSchemaVersion: 1,
    documentId,
    documentVersion: 1,
    eventSchemaVersion: 1,
    futureOptionalMetadata: 'ignored',
    knowledgeBaseId: ownerId === LOCAL_USER_ID ? localKnowledgeBaseId : otherKnowledgeBaseId,
  };
  await sql`INSERT INTO outbox_events
      (id, owner_id, event_type, aggregate_id, aggregate_version, schema_version, payload)
    VALUES (${id}::uuid, ${ownerId}::uuid, 'document.saved', ${documentId}::uuid,
      1, 1, ${JSON.stringify(payload)}::jsonb)`.execute(environment.getDatabase());
}

/** 用于按代表查询形态联结所有者及 Document、KnowledgeBase 生命周期。 */
async function representativeQuery(
  ownerId: string,
  query: string,
  mode: 'cjk' | 'latin',
): Promise<string[]> {
  const predicate =
    mode === 'latin'
      ? sql`sb.search_vector @@ plainto_tsquery('pg_catalog.simple'::regconfig, ${query})`
      : sql`sb.text ILIKE ${`%${query}%`}`;
  const result = await sql<{ text: string }>`SELECT sb.text FROM search_blocks sb
    JOIN documents d ON d.id = sb.document_id AND d.owner_id = sb.owner_id
    JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id AND kb.owner_id = d.owner_id
    WHERE sb.owner_id = ${ownerId}::uuid AND d.deleted_at IS NULL AND kb.deleted_at IS NULL
      AND ${predicate}
    ORDER BY sb.document_id, sb.block_order`.execute(environment.getDatabase());
  return result.rows.map(({ text }) => text);
}

/** 用于验证固定中英文样例、所有者过滤及知识库删除即时不可见。 */
async function verifyRepresentativeQueries(): Promise<void> {
  await sql`UPDATE search_blocks SET text = '分布式系统中的幂等设计'
    WHERE document_id = ${localDocumentId}::uuid`.execute(environment.getDatabase());
  expect(await representativeQuery(LOCAL_USER_ID, '幂等', 'cjk')).toEqual([
    '分布式系统中的幂等设计',
  ]);
  await sql`UPDATE search_blocks SET text = 'transactional outbox'
    WHERE document_id = ${localDocumentId}::uuid`.execute(environment.getDatabase());
  expect(await representativeQuery(LOCAL_USER_ID, 'outbox', 'latin')).toEqual([
    'transactional outbox',
  ]);
  expect(await representativeQuery(otherUserId, 'other', 'latin')).toEqual(['other content']);
  await environment
    .getDatabase()
    .updateTable('knowledge_bases')
    .set({ deleted_at: new Date() })
    .where('id', '=', otherKnowledgeBaseId)
    .execute();
  expect(await representativeQuery(otherUserId, 'other', 'latin')).toEqual([]);
  await environment.resolveService(SearchProjectionService).scanCurrentDocuments();
  const projection = await environment
    .getDatabase()
    .selectFrom('search_document_projections')
    .select('document_id')
    .where('document_id', '=', otherDocumentId)
    .executeTakeFirst();
  expect(projection).toBeUndefined();
}

/** 用于验证可见文档成功事件重放不会复制或更换搜索块身份。 */
async function verifySuccessfulReplayIsIdempotent(): Promise<void> {
  const before = await environment
    .getDatabase()
    .selectFrom('search_blocks')
    .select(['block_id', 'id'])
    .where('document_id', '=', localDocumentId)
    .execute();
  await environment
    .getDatabase()
    .updateTable('outbox_events')
    .set({ processed_at: null })
    .where('id', '=', '2a000000-0000-4000-8000-000000000011')
    .execute();
  await environment.resolveService(SearchProjectionService).processPendingEvents();
  const after = await environment
    .getDatabase()
    .selectFrom('search_blocks')
    .select(['block_id', 'id'])
    .where('document_id', '=', localDocumentId)
    .execute();
  expect(after).toEqual(before);
  expect(after).toHaveLength(1);
}

/** 用于验证缺失保存 Schema 或知识库标识的毒事件被安全隔离。 */
async function quarantinesMalformedSavedPayload(): Promise<void> {
  const eventId = '2a000000-0000-4000-8000-000000000013';
  const missingDocumentId = '2a000000-0000-4000-8000-000000000099';
  const payload = { documentId: missingDocumentId, documentVersion: 1, eventSchemaVersion: 1 };
  await sql`INSERT INTO outbox_events
      (id, owner_id, event_type, aggregate_id, aggregate_version, schema_version, payload)
    VALUES (${eventId}::uuid, ${LOCAL_USER_ID}::uuid, 'document.saved',
      ${missingDocumentId}::uuid, 1, 1, ${JSON.stringify(payload)}::jsonb)`.execute(
    environment.getDatabase(),
  );

  const stats = await environment.resolveService(SearchProjectionService).processPendingEvents();

  const event = await environment
    .getDatabase()
    .selectFrom('outbox_events')
    .select(['failed_at', 'last_error_code', 'processed_at'])
    .where('id', '=', eventId)
    .executeTakeFirstOrThrow();
  expect(stats.quarantinedEvents).toBe(1);
  expect(event).toMatchObject({ last_error_code: 'OUTBOX_PAYLOAD_INVALID', processed_at: null });
  expect(event.failed_at).toBeInstanceOf(Date);
}

/** 用于验证伪造跨所有者事件不可读取他人正文，而合法事件保持各自归属。 */
async function keepsProjectionOwnershipIsolated(): Promise<void> {
  await insertOwnedDocument({
    content: contentOf(1, 'local content'),
    documentId: localDocumentId,
    knowledgeBaseId: localKnowledgeBaseId,
    ownerId: LOCAL_USER_ID,
  });
  await insertOwnedDocument({
    content: contentOf(2, 'other content'),
    documentId: otherDocumentId,
    knowledgeBaseId: otherKnowledgeBaseId,
    ownerId: otherUserId,
  });
  await insertSavedEvent('2a000000-0000-4000-8000-000000000010', LOCAL_USER_ID, otherDocumentId);
  await insertSavedEvent('2a000000-0000-4000-8000-000000000011', LOCAL_USER_ID, localDocumentId);
  await insertSavedEvent('2a000000-0000-4000-8000-000000000012', otherUserId, otherDocumentId);

  await environment.resolveService(SearchProjectionService).processPendingEvents();

  const rows = await sql<{ document_id: string; owner_id: string; text: string }>`
    SELECT document_id, owner_id, text FROM search_blocks ORDER BY owner_id, document_id
  `.execute(environment.getDatabase());
  expect(rows.rows).toEqual([
    { document_id: localDocumentId, owner_id: LOCAL_USER_ID, text: 'local content' },
    { document_id: otherDocumentId, owner_id: otherUserId, text: 'other content' },
  ]);
  await verifySuccessfulReplayIsIdempotent();
  await verifyRepresentativeQueries();
}

/** 用于仅在真实 PostgreSQL 可用时注册所有者隔离场景。 */
function defineSearchProjectionIsolationTests(): void {
  beforeAll(async () => {
    await environment.prepareApplication();
    await environment.insertOtherUser();
    await environment.insertKnowledgeBases([
      { id: localKnowledgeBaseId, name: '本人库' },
      { id: otherKnowledgeBaseId, name: '他人库', ownerId: otherUserId },
    ]);
  }, 30_000);
  afterAll(() => environment.releaseApplication());
  test('keeps projection ownership isolated', keepsProjectionOwnershipIsolated);
  test('quarantines malformed saved payload', quarantinesMalformedSavedPayload);
}

describe.skipIf(databaseUrl === undefined)(
  'search projection owner isolation',
  defineSearchProjectionIsolationTests,
);
