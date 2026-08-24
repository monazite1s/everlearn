/** @fileoverview 封装 Search 模块在单事务内领取事件与写入文档投影的 PostgreSQL 操作。 */

import { createHash, randomUUID } from 'node:crypto';

import type { Transaction } from 'kysely' with { 'resolution-mode': 'import' };

import type { DatabaseSchema, JsonValue } from '../database/database.types';
import { parseSearchBlocks, type SearchBlockDraft } from './search-block.parser';
import {
  SearchProjectionPermanentError,
  type ClaimedSearchEvent,
  type SearchScanCandidate,
} from './search-projection.model';

export const SEARCH_EVENT_BATCH_SIZE = 100;

interface CurrentDocument {
  readonly contentJson: JsonValue;
  readonly deletedAt: Date | null;
  readonly documentId: string;
  readonly knowledgeBaseId: string;
  readonly knowledgeBaseDeletedAt: Date | null;
  readonly ownerId: string;
  readonly version: number;
}

/** 用于按文档与知识库双重生命周期判定当前搜索可见性。 */
function isVisibleDocument(document: CurrentDocument | undefined): document is CurrentDocument {
  return document?.deletedAt === null && document.knowledgeBaseDeletedAt === null;
}

/** 用于按确定序列化计算整份正文的投影状态哈希。 */
function hashDocumentContent(content: JsonValue): string {
  return createHash('sha256').update(JSON.stringify(content), 'utf8').digest('hex');
}

/** 用于在当前事务领取一条到期且未终结的事件。 */
export async function claimPendingEvent(
  transaction: Transaction<DatabaseSchema>,
): Promise<ClaimedSearchEvent | undefined> {
  const { sql } = await import('kysely');
  const result = await sql<{
    aggregate_id: string;
    aggregate_version: number;
    event_type: string;
    id: string;
    owner_id: string;
    payload: JsonValue;
    schema_version: number;
  }>`SELECT id, owner_id, event_type, aggregate_id, aggregate_version,
      schema_version, payload, attempt_count
    FROM outbox_events
    WHERE processed_at IS NULL AND failed_at IS NULL AND available_at <= now()
    ORDER BY available_at, occurred_at, id
    LIMIT 1 FOR UPDATE SKIP LOCKED`.execute(transaction);
  const row = result.rows[0];
  if (row === undefined) return undefined;
  return {
    aggregateId: row.aggregate_id,
    aggregateVersion: row.aggregate_version,
    eventType: row.event_type,
    id: row.id,
    ownerId: row.owner_id,
    payload: row.payload,
    schemaVersion: row.schema_version,
  };
}

/** 用于读取当前文档和知识库生命周期，异步事件不能替代数据库事实。 */
async function readCurrentDocument(
  transaction: Transaction<DatabaseSchema>,
  event: ClaimedSearchEvent,
): Promise<CurrentDocument | undefined> {
  const { sql } = await import('kysely');
  const result = await sql<{
    content_json: JsonValue;
    deleted_at: Date | null;
    document_id: string;
    knowledge_base_id: string;
    knowledge_base_deleted_at: Date | null;
    owner_id: string;
    version: number;
  }>`SELECT d.id AS document_id, d.owner_id, d.knowledge_base_id, d.content_json,
      d.version, d.deleted_at,
      kb.deleted_at AS knowledge_base_deleted_at
    FROM documents d
    JOIN knowledge_bases kb
      ON kb.id = d.knowledge_base_id AND kb.owner_id = d.owner_id
    WHERE d.id = ${event.aggregateId}::uuid AND d.owner_id = ${event.ownerId}::uuid
    FOR UPDATE OF d`.execute(transaction);
  const row = result.rows[0];
  if (row === undefined) return undefined;
  return {
    contentJson: row.content_json,
    deletedAt: row.deleted_at,
    documentId: row.document_id,
    knowledgeBaseId: row.knowledge_base_id,
    knowledgeBaseDeletedAt: row.knowledge_base_deleted_at,
    ownerId: row.owner_id,
    version: row.version,
  };
}

/** 用于读取当前投影版本以阻止乱序事件降级。 */
async function readProjectionVersion(
  transaction: Transaction<DatabaseSchema>,
  document: CurrentDocument,
): Promise<number | undefined> {
  const row = await transaction
    .selectFrom('search_document_projections')
    .select('indexed_document_version')
    .where('document_id', '=', document.documentId)
    .where('owner_id', '=', document.ownerId)
    .executeTakeFirst();
  return row?.indexed_document_version;
}

/** 用于写入当前文档投影头并保持文档版本单调。 */
async function upsertProjection(
  transaction: Transaction<DatabaseSchema>,
  document: CurrentDocument,
): Promise<void> {
  const { sql } = await import('kysely');
  await transaction
    .insertInto('search_document_projections')
    .values({
      document_id: document.documentId,
      indexed_content_hash: hashDocumentContent(document.contentJson),
      indexed_document_version: document.version,
      owner_id: document.ownerId,
    })
    .onConflict((conflict) =>
      conflict.columns(['document_id', 'owner_id']).doUpdateSet({
        indexed_at: sql`transaction_timestamp()`,
        indexed_content_hash: hashDocumentContent(document.contentJson),
        indexed_document_version: document.version,
      }),
    )
    .execute();
}

/** 用于按稳定 Block ID 幂等插入或更新一个搜索块。 */
async function upsertBlock(
  transaction: Transaction<DatabaseSchema>,
  document: CurrentDocument,
  draft: SearchBlockDraft,
): Promise<void> {
  const { sql } = await import('kysely');
  await transaction
    .insertInto('search_blocks')
    .values({
      block_id: draft.blockId,
      block_order: draft.blockOrder,
      content_hash: draft.contentHash,
      document_id: document.documentId,
      document_version: document.version,
      heading_path: [...draft.headingPath],
      id: randomUUID(),
      owner_id: document.ownerId,
      text: draft.text,
    })
    .onConflict((conflict) =>
      conflict.columns(['owner_id', 'document_id', 'block_id']).doUpdateSet({
        block_order: draft.blockOrder,
        content_hash: draft.contentHash,
        document_version: document.version,
        heading_path: [...draft.headingPath],
        text: draft.text,
        updated_at: sql`transaction_timestamp()`,
      }),
    )
    .execute();
}

/** 用于删除当前正文已不存在的块而保留未变化块的身份。 */
async function deleteMissingBlocks(
  transaction: Transaction<DatabaseSchema>,
  document: CurrentDocument,
  drafts: readonly SearchBlockDraft[],
): Promise<void> {
  let deletion = transaction
    .deleteFrom('search_blocks')
    .where('document_id', '=', document.documentId)
    .where('owner_id', '=', document.ownerId);
  if (drafts.length > 0)
    deletion = deletion.where(
      'block_id',
      'not in',
      drafts.map((draft) => draft.blockId),
    );
  await deletion.execute();
}

/** 用于把已解析块与投影头在一个事务中原子写入。 */
async function writeCurrentProjection(
  transaction: Transaction<DatabaseSchema>,
  document: CurrentDocument,
  drafts: readonly SearchBlockDraft[],
): Promise<void> {
  await upsertProjection(transaction, document);
  for (const draft of drafts) await upsertBlock(transaction, document, draft);
  await deleteMissingBlocks(transaction, document, drafts);
}

/** 用于在一个事务中让文档全部搜索块与当前正文原子一致。 */
async function projectCurrentDocument(
  transaction: Transaction<DatabaseSchema>,
  document: CurrentDocument,
): Promise<void> {
  const drafts = await parseSearchBlocks(document.contentJson);
  if (drafts === undefined) throw new SearchProjectionPermanentError('SEARCH_CONTENT_INVALID');
  await writeCurrentProjection(transaction, document, drafts);
}

/** 用于核对投影头和全部块是否与当前解析结果完全一致。 */
async function projectionMatches(
  transaction: Transaction<DatabaseSchema>,
  document: CurrentDocument,
  drafts: readonly SearchBlockDraft[],
): Promise<boolean> {
  const projection = await transaction
    .selectFrom('search_document_projections')
    .select(['indexed_content_hash', 'indexed_document_version'])
    .where('document_id', '=', document.documentId)
    .where('owner_id', '=', document.ownerId)
    .executeTakeFirst();
  if (
    projection?.indexed_document_version !== document.version ||
    projection.indexed_content_hash !== hashDocumentContent(document.contentJson)
  )
    return false;
  const blocks = await transaction
    .selectFrom('search_blocks')
    .select(['block_id', 'block_order', 'content_hash', 'document_version', 'heading_path', 'text'])
    .where('document_id', '=', document.documentId)
    .where('owner_id', '=', document.ownerId)
    .orderBy('block_order')
    .execute();
  return (
    blocks.length === drafts.length &&
    drafts.every((draft, index) => {
      const block = blocks[index];
      return (
        block?.block_id === draft.blockId &&
        block.block_order === draft.blockOrder &&
        block.content_hash === draft.contentHash &&
        block.document_version === document.version &&
        block.text === draft.text &&
        JSON.stringify(block.heading_path) === JSON.stringify(draft.headingPath)
      );
    })
  );
}

/** 用于推进健康投影的最近核对时间，使周期扫描页面公平轮转。 */
async function touchVerifiedProjection(
  transaction: Transaction<DatabaseSchema>,
  document: CurrentDocument,
): Promise<void> {
  const { sql } = await import('kysely');
  await transaction
    .updateTable('search_document_projections')
    .set({ indexed_at: sql`transaction_timestamp()` })
    .where('document_id', '=', document.documentId)
    .where('owner_id', '=', document.ownerId)
    .execute();
}

/** 用于清理不再可见或已不存在文档的全部搜索投影。 */
async function deleteDocumentProjection(
  transaction: Transaction<DatabaseSchema>,
  event: Pick<ClaimedSearchEvent, 'aggregateId' | 'ownerId'>,
): Promise<void> {
  await transaction
    .deleteFrom('search_document_projections')
    .where('document_id', '=', event.aggregateId)
    .where('owner_id', '=', event.ownerId)
    .execute();
}

/** 用于按数据库当前状态消费一条已校验事件并保持版本单调。 */
export async function applyClaimedEvent(
  transaction: Transaction<DatabaseSchema>,
  event: ClaimedSearchEvent,
): Promise<void> {
  const document = await readCurrentDocument(transaction, event);
  const payload = event.payload as { knowledgeBaseId: string };
  if (document !== undefined && document.knowledgeBaseId !== payload.knowledgeBaseId) {
    throw new SearchProjectionPermanentError('OUTBOX_PAYLOAD_INVALID');
  }
  if (!isVisibleDocument(document)) {
    await deleteDocumentProjection(transaction, event);
    return;
  }
  if (event.aggregateVersion > document.version) throw new Error('DOCUMENT_VERSION_AHEAD');
  if (event.aggregateVersion < document.version) return;
  const indexedVersion = await readProjectionVersion(transaction, document);
  if (indexedVersion !== undefined && indexedVersion >= document.version) return;
  await projectCurrentDocument(transaction, document);
}

/** 用于把成功事件标记为已处理。 */
export async function markEventProcessed(
  transaction: Transaction<DatabaseSchema>,
  eventId: string,
): Promise<void> {
  const { sql } = await import('kysely');
  await transaction
    .updateTable('outbox_events')
    .set({ last_error_code: null, processed_at: sql`transaction_timestamp()` })
    .where('id', '=', eventId)
    .execute();
}

/** 用于把无法解释的事件隔离为终态。 */
export async function quarantineEvent(
  transaction: Transaction<DatabaseSchema>,
  eventId: string,
  code: string,
): Promise<void> {
  const { sql } = await import('kysely');
  await transaction
    .updateTable('outbox_events')
    .set({ failed_at: sql`transaction_timestamp()`, last_error_code: code })
    .where('id', '=', eventId)
    .execute();
}

/** 用于按稳定文档标识游标列出一页有效文档并保证永久失败不会阻塞后页。 */
export async function findScanCandidates(
  transaction: Transaction<DatabaseSchema>,
  afterDocumentId?: string,
): Promise<readonly SearchScanCandidate[]> {
  const { sql } = await import('kysely');
  const cursorPredicate =
    afterDocumentId === undefined ? sql`` : sql`AND d.id > ${afterDocumentId}::uuid`;
  const result = await sql<{ document_id: string; owner_id: string }>`
    SELECT d.id AS document_id, d.owner_id
    FROM documents d
    JOIN knowledge_bases kb
      ON kb.id = d.knowledge_base_id AND kb.owner_id = d.owner_id AND kb.deleted_at IS NULL
    WHERE d.deleted_at IS NULL
      ${cursorPredicate}
    ORDER BY d.id
    LIMIT ${SEARCH_EVENT_BATCH_SIZE}`.execute(transaction);
  return result.rows.map((row) => ({ documentId: row.document_id, ownerId: row.owner_id }));
}

/** 用于锁定扫描候选并按当前数据库事实重建其投影。 */
export async function projectScanCandidate(
  transaction: Transaction<DatabaseSchema>,
  candidate: SearchScanCandidate,
): Promise<boolean> {
  const event: ClaimedSearchEvent = {
    aggregateId: candidate.documentId,
    aggregateVersion: 1,
    eventType: 'document.saved',
    id: candidate.documentId,
    ownerId: candidate.ownerId,
    payload: {},
    schemaVersion: 1,
  };
  const document = await readCurrentDocument(transaction, event);
  if (!isVisibleDocument(document)) return false;
  const drafts = await parseSearchBlocks(document.contentJson);
  if (drafts === undefined) throw new SearchProjectionPermanentError('SEARCH_CONTENT_INVALID');
  if (await projectionMatches(transaction, document, drafts)) {
    await touchVerifiedProjection(transaction, document);
    return false;
  }
  await writeCurrentProjection(transaction, document, drafts);
  return true;
}

/** 用于删除文档或知识库已失效的多余投影并返回数量。 */
export async function removeExtraProjections(
  transaction: Transaction<DatabaseSchema>,
): Promise<number> {
  const { sql } = await import('kysely');
  const result = await sql<{ document_id: string }>`DELETE FROM search_document_projections p
    WHERE NOT EXISTS (
      SELECT 1 FROM documents d
      JOIN knowledge_bases kb
        ON kb.id = d.knowledge_base_id AND kb.owner_id = d.owner_id
      WHERE d.id = p.document_id AND d.owner_id = p.owner_id
        AND d.deleted_at IS NULL AND kb.deleted_at IS NULL
    ) RETURNING document_id`.execute(transaction);
  return result.rows.length;
}
