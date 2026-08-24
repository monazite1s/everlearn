/** @fileoverview 使用真实 PostgreSQL 验证搜索投影消费、隔离、重试与补偿收敛。 */

import { sql } from 'kysely';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import { DocumentsTestEnvironment, otherUserId } from '../../tests/documents-integration.support';
import { LOCAL_USER_ID } from '../identity/local-identity.constants';
import { SearchProjectionService } from './search-projection.service';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(
  `search_projection_runtime_${process.pid}`,
  databaseUrl ?? '',
);
const internalSecret = 'search-projection-integration-secret';
const knowledgeBaseId = '28000000-0000-4000-8000-000000000001';
const firstDocumentId = '28000000-0000-4000-8000-000000000002';
const secondDocumentId = '28000000-0000-4000-8000-000000000003';

interface DocumentState {
  readonly content: object;
  readonly deleted?: boolean;
  readonly id: string;
  readonly version: number;
}

/** 用于生成带稳定块标识的正文。 */
function contentOf(blockSequence: number, text: string): object {
  return {
    content: [
      {
        attrs: { blockId: `28000000-0000-4000-8000-${blockSequence.toString().padStart(12, '0')}` },
        content: [{ text, type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  };
}

/** 用于插入具备当前正文和生命周期状态的知识文档。 */
async function insertDocument(state: DocumentState): Promise<void> {
  await environment.insertDocuments([
    {
      ...(state.deleted === undefined ? {} : { deleted: state.deleted }),
      id: state.id,
      knowledgeBaseId,
      position: state.id === firstDocumentId ? 0 : 1,
    },
  ]);
  await sql`UPDATE documents SET content_json = ${JSON.stringify(state.content)}::jsonb,
      plain_text = ${plainTextOf(state.content)}, schema_version = 1, version = ${state.version}
    WHERE id = ${state.id}::uuid`.execute(environment.getDatabase());
}

/** 用于从单段测试正文取得服务端同步纯文本。 */
function plainTextOf(content: object): string {
  const root = content as { content?: { content?: { text?: string }[] }[] };
  return root.content?.[0]?.content?.[0]?.text ?? '';
}

/** 用于插入可由搜索消费者领取的版本化 Outbox 事件。 */
async function insertEvent(
  id: string,
  documentId: string,
  version: number,
  schemaVersion = 1,
): Promise<void> {
  const payload = {
    contentSchemaVersion: 1,
    documentId,
    documentVersion: version,
    eventSchemaVersion: schemaVersion,
    knowledgeBaseId,
  };
  await sql`INSERT INTO outbox_events
      (id, owner_id, event_type, aggregate_id, aggregate_version, schema_version, payload)
    VALUES (${id}::uuid, ${LOCAL_USER_ID}::uuid, 'document.saved', ${documentId}::uuid,
      ${version}, ${schemaVersion}, ${JSON.stringify(payload)}::jsonb)`.execute(
    environment.getDatabase(),
  );
}

/** 用于读取文档投影及块版本，便于断言单调收敛。 */
async function projectionState(documentId: string): Promise<{
  readonly blocks: number;
  readonly projectionVersion: number | null;
  readonly versions: number[];
}> {
  const result = await sql<{
    blocks: string;
    projection_version: number | null;
    versions: number[];
  }>`
    SELECT count(sb.id)::text AS blocks,
      max(p.indexed_document_version) AS projection_version,
      coalesce(array_agg(sb.document_version ORDER BY sb.block_order)
        FILTER (WHERE sb.id IS NOT NULL), '{}'::integer[]) AS versions
    FROM search_document_projections p
    LEFT JOIN search_blocks sb ON sb.document_id = p.document_id AND sb.owner_id = p.owner_id
    WHERE p.document_id = ${documentId}::uuid AND p.owner_id = ${LOCAL_USER_ID}::uuid
  `.execute(environment.getDatabase());
  const row = result.rows[0];
  return {
    blocks: Number(row?.blocks ?? 0),
    projectionVersion: row?.projection_version ?? null,
    versions: row?.versions ?? [],
  };
}

/** 用于启动迁移后的生产模块并配置既有内部密钥边界。 */
async function prepareApplication(): Promise<void> {
  process.env.PURGE_TRIGGER_SECRET = internalSecret;
  await environment.prepareApplication();
}

/** 用于清理搜索事件后复用现有集成夹具。 */
async function resetApplication(): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS reject_search_block ON search_blocks`.execute(
    environment.getDatabase(),
  );
  await sql`DROP FUNCTION IF EXISTS reject_search_block()`.execute(environment.getDatabase());
  await sql`DELETE FROM outbox_events`.execute(environment.getDatabase());
  await environment.resetFixtures();
  await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: '搜索投影库' }]);
}

/** 用于安装只影响搜索块写入的临时数据库故障。 */
async function installProjectionFailure(): Promise<void> {
  await sql`CREATE FUNCTION reject_search_block() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'temporary projection failure'; END $$;
    CREATE TRIGGER reject_search_block BEFORE INSERT ON search_blocks
      FOR EACH ROW EXECUTE FUNCTION reject_search_block()`.execute(environment.getDatabase());
}

/** 用于移除临时搜索块故障并恢复正常投影。 */
async function removeProjectionFailure(): Promise<void> {
  await sql`DROP TRIGGER reject_search_block ON search_blocks`.execute(environment.getDatabase());
  await sql`DROP FUNCTION reject_search_block()`.execute(environment.getDatabase());
}

/** 用于验证内部端点拒绝缺失密钥并在正确密钥下投影正文。 */
async function protectsAndProcessesInternalEndpoint(): Promise<void> {
  await insertDocument({
    content: contentOf(1, 'transactional outbox'),
    id: firstDocumentId,
    version: 1,
  });
  await insertEvent('28000000-0000-4000-8000-000000000010', firstDocumentId, 1);

  expect(
    (await request(environment.getHttpServer()).post('/api/v1/internal/search-projection')).status,
  ).toBe(401);
  const response = await request(environment.getHttpServer())
    .post('/api/v1/internal/search-projection')
    .set('x-purge-secret', internalSecret);

  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    processedEvents: 1,
    quarantinedEvents: 0,
    scannedDocuments: 0,
  });
  expect(await projectionState(firstDocumentId)).toEqual({
    blocks: 1,
    projectionVersion: 1,
    versions: [1],
  });
}

/** 用于验证后到旧事件不会覆盖已经提交的新版本投影。 */
async function ignoresLateOlderEvents(): Promise<void> {
  await insertDocument({
    content: contentOf(2, 'current version'),
    id: firstDocumentId,
    version: 3,
  });
  await insertEvent('28000000-0000-4000-8000-000000000011', firstDocumentId, 3);
  const service = environment.resolveService(SearchProjectionService);
  await service.processPendingEvents();
  await insertEvent('28000000-0000-4000-8000-000000000012', firstDocumentId, 2);

  await service.processPendingEvents();

  expect(await projectionState(firstDocumentId)).toEqual({
    blocks: 1,
    projectionVersion: 3,
    versions: [3],
  });
}

/** 用于验证删除后的迟到保存只能清理而不能重新暴露正文。 */
async function keepsDeletedDocumentsInvisible(): Promise<void> {
  await insertDocument({
    content: contentOf(3, 'will be deleted'),
    id: firstDocumentId,
    version: 2,
  });
  const service = environment.resolveService(SearchProjectionService);
  await insertEvent('28000000-0000-4000-8000-000000000013', firstDocumentId, 2);
  await service.processPendingEvents();
  await environment.insertOtherUser();
  const foreignPayload = {
    documentId: firstDocumentId,
    documentVersion: 2,
    eventSchemaVersion: 1,
    knowledgeBaseId,
  };
  await sql`INSERT INTO outbox_events
      (id, owner_id, event_type, aggregate_id, aggregate_version, schema_version, payload)
    VALUES (${'28000000-0000-4000-8000-000000000019'}::uuid, ${otherUserId}::uuid,
      'document.saved', ${firstDocumentId}::uuid, 2, 1, ${JSON.stringify(foreignPayload)}::jsonb)`.execute(
    environment.getDatabase(),
  );
  await service.processPendingEvents();
  expect(await projectionState(firstDocumentId)).toMatchObject({ projectionVersion: 2 });
  await sql`UPDATE documents SET deleted_at = now(), deleted_position = position, version = 3
    WHERE id = ${firstDocumentId}::uuid`.execute(environment.getDatabase());
  await sql`UPDATE outbox_events SET processed_at = NULL, available_at = now()
    WHERE id = ${'28000000-0000-4000-8000-000000000013'}::uuid`.execute(environment.getDatabase());

  await service.processPendingEvents();

  expect(await projectionState(firstDocumentId)).toEqual({
    blocks: 0,
    projectionVersion: null,
    versions: [],
  });
}

/** 用于验证未知 Schema 被隔离且不会阻塞紧随其后的合法事件。 */
async function quarantinesUnknownSchemaWithoutBlocking(): Promise<void> {
  await insertDocument({ content: contentOf(4, 'first'), id: firstDocumentId, version: 1 });
  await insertDocument({ content: contentOf(5, 'second'), id: secondDocumentId, version: 1 });
  await insertEvent('28000000-0000-4000-8000-000000000014', firstDocumentId, 1, 2);
  await insertEvent('28000000-0000-4000-8000-000000000015', secondDocumentId, 1);

  await environment.resolveService(SearchProjectionService).processPendingEvents();

  const rows = await sql<{
    failed_at: Date | null;
    id: string;
    last_error_code: string | null;
    processed_at: Date | null;
  }>`
    SELECT id, failed_at, last_error_code, processed_at FROM outbox_events ORDER BY id
  `.execute(environment.getDatabase());
  expect(rows.rows[0]).toMatchObject({
    last_error_code: 'OUTBOX_SCHEMA_UNSUPPORTED',
    processed_at: null,
  });
  expect(rows.rows[0]?.failed_at).toBeInstanceOf(Date);
  expect(rows.rows[1]?.processed_at).toBeInstanceOf(Date);
  expect(await projectionState(secondDocumentId)).toMatchObject({ projectionVersion: 1 });
}

/** 用于验证数据库暂时失败会退避，解除故障后同一事件可成功。 */
async function retriesTemporaryProjectionFailure(): Promise<void> {
  await insertDocument({
    content: contentOf(6, 'retry succeeds'),
    id: firstDocumentId,
    version: 1,
  });
  await insertEvent('28000000-0000-4000-8000-000000000016', firstDocumentId, 1);
  await installProjectionFailure();
  const service = environment.resolveService(SearchProjectionService);

  await service.processPendingEvents();

  const failed = await sql<{ attempt_count: number; available_at: Date; failed_at: Date | null }>`
    SELECT attempt_count, available_at, failed_at FROM outbox_events
    WHERE id = ${'28000000-0000-4000-8000-000000000016'}::uuid
  `.execute(environment.getDatabase());
  expect(failed.rows[0]?.attempt_count).toBe(1);
  expect(failed.rows[0]?.available_at.getTime()).toBeGreaterThan(Date.now());
  expect(failed.rows[0]?.failed_at).toBeNull();
  await removeProjectionFailure();
  await sql`UPDATE outbox_events SET available_at = now()
    WHERE id = ${'28000000-0000-4000-8000-000000000016'}::uuid`.execute(environment.getDatabase());
  await service.processPendingEvents();
  expect(await projectionState(firstDocumentId)).toMatchObject({ projectionVersion: 1 });
}

/** 用于验证持续失败达到上限后进入隔离终态。 */
async function quarantinesAfterBoundedRetries(): Promise<void> {
  const eventId = '28000000-0000-4000-8000-000000000017';
  await insertDocument({ content: contentOf(9, 'bounded retry'), id: firstDocumentId, version: 1 });
  await insertEvent(eventId, firstDocumentId, 1);
  await installProjectionFailure();
  const service = environment.resolveService(SearchProjectionService);
  let quarantinedEvents = 0;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await sql`UPDATE outbox_events SET available_at = now() WHERE id = ${eventId}::uuid`.execute(
      environment.getDatabase(),
    );
    quarantinedEvents += (await service.processPendingEvents()).quarantinedEvents;
  }

  const result = await sql<{ attempt_count: number; failed_at: Date | null }>`
    SELECT attempt_count, failed_at FROM outbox_events WHERE id = ${eventId}::uuid
  `.execute(environment.getDatabase());
  expect(result.rows[0]?.attempt_count).toBe(5);
  expect(result.rows[0]?.failed_at).toBeInstanceOf(Date);
  expect(quarantinedEvents).toBe(1);
}

/** 用于验证扫描同时修复缺失投影与已删除文档的多余投影。 */
async function scanRepairsMissingAndExtraProjections(): Promise<void> {
  await insertDocument({
    content: contentOf(7, 'missing projection'),
    id: firstDocumentId,
    version: 2,
  });
  await insertDocument({
    content: contentOf(8, 'extra projection'),
    deleted: true,
    id: secondDocumentId,
    version: 2,
  });
  await sql`INSERT INTO search_document_projections
      (document_id, owner_id, indexed_document_version, indexed_content_hash)
    VALUES
      (${firstDocumentId}::uuid, ${LOCAL_USER_ID}::uuid, 2, ${'a'.repeat(64)}),
      (${secondDocumentId}::uuid, ${LOCAL_USER_ID}::uuid, 1, ${'b'.repeat(64)})`.execute(
    environment.getDatabase(),
  );
  await sql`INSERT INTO search_blocks
      (id, owner_id, document_id, document_version, block_id, block_order,
        text, heading_path, content_hash)
    VALUES
      (${'28000000-0000-4000-8000-000000000030'}::uuid, ${LOCAL_USER_ID}::uuid,
        ${firstDocumentId}::uuid, 2, ${'28000000-0000-4000-8000-000000000007'}::uuid,
        0, 'missing projection', '{}', ${'c'.repeat(64)}),
      (${'28000000-0000-4000-8000-000000000031'}::uuid, ${LOCAL_USER_ID}::uuid,
        ${firstDocumentId}::uuid, 2, ${'28000000-0000-4000-8000-000000000099'}::uuid,
        1, 'extra block', '{}', ${'d'.repeat(64)})`.execute(environment.getDatabase());

  const result = await environment.resolveService(SearchProjectionService).scanCurrentDocuments();

  expect(result).toMatchObject({ projectedDocuments: 1, removedProjections: 1 });
  expect(await projectionState(firstDocumentId)).toMatchObject({ projectionVersion: 2 });
  expect(await projectionState(secondDocumentId)).toMatchObject({ projectionVersion: null });
}

/** 用于验证恢复事件按数据库当前正文重建可见投影。 */
async function restoreRebuildsCurrentProjection(): Promise<void> {
  await insertDocument({
    content: contentOf(10, 'restored content'),
    deleted: true,
    id: firstDocumentId,
    version: 2,
  });
  await sql`UPDATE documents SET deleted_at = NULL, deleted_parent_id = NULL,
      deleted_position = NULL, version = 3 WHERE id = ${firstDocumentId}::uuid`.execute(
    environment.getDatabase(),
  );
  const payload = {
    documentId: firstDocumentId,
    documentVersion: 3,
    eventSchemaVersion: 1,
    knowledgeBaseId,
  };
  await sql`INSERT INTO outbox_events
      (id, owner_id, event_type, aggregate_id, aggregate_version, schema_version, payload)
    VALUES (${'28000000-0000-4000-8000-000000000018'}::uuid, ${LOCAL_USER_ID}::uuid,
      'document.restored', ${firstDocumentId}::uuid, 3, 1, ${JSON.stringify(payload)}::jsonb)`.execute(
    environment.getDatabase(),
  );

  await environment.resolveService(SearchProjectionService).processPendingEvents();

  expect(await projectionState(firstDocumentId)).toEqual({
    blocks: 1,
    projectionVersion: 3,
    versions: [3],
  });
}

/** 用于仅在提供真实 PostgreSQL 时注册搜索投影纵向切片测试。 */
function defineSearchProjectionTests(): void {
  beforeAll(prepareApplication, 30_000);
  afterAll(() => environment.releaseApplication());
  beforeEach(resetApplication);
  test('protects and processes the internal endpoint', protectsAndProcessesInternalEndpoint);
  test('ignores late older events', ignoresLateOlderEvents);
  test('keeps deleted documents invisible', keepsDeletedDocumentsInvisible);
  test('quarantines unknown schema without blocking', quarantinesUnknownSchemaWithoutBlocking);
  test('retries temporary projection failures', retriesTemporaryProjectionFailure);
  test('quarantines after bounded retries', quarantinesAfterBoundedRetries);
  test('scan repairs missing and extra projections', scanRepairsMissingAndExtraProjections);
  test('restore rebuilds the current projection', restoreRebuildsCurrentProjection);
}

describe.skipIf(databaseUrl === undefined)(
  'search projection runtime',
  defineSearchProjectionTests,
);
