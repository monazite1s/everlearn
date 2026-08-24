/** @fileoverview 在真实 PostgreSQL 中逐项验证补偿扫描修复缺失、过期和多余块。 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { DocumentsTestEnvironment } from '../../tests/documents-integration.support';
import { LOCAL_USER_ID } from '../identity/local-identity.constants';
import { SearchProjectionService } from './search-projection.service';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(
  `search_reconcile_${process.pid}`,
  databaseUrl ?? '',
);
const knowledgeBaseId = '30000000-0000-4000-8000-000000000001';
const missingDocumentId = '30000000-0000-4000-8000-000000000002';
const staleDocumentId = '30000000-0000-4000-8000-000000000003';
const extraDocumentId = '30000000-0000-4000-8000-000000000004';
const extraBlockId = '30000000-0000-4000-8000-000000000099';

/** 用于构造指定块和文本的合法单段正文。 */
function contentOf(blockId: string, text: string): object {
  return {
    content: [{ attrs: { blockId }, content: [{ text, type: 'text' }], type: 'paragraph' }],
    type: 'doc',
  };
}

/** 用于按文档标识生成其稳定合法块标识。 */
function blockIdOf(documentId: string): string {
  return documentId.replace('30000000-', '31000000-');
}

/** 用于写入正文与版本并保留测试所需显式状态。 */
async function writeContent(documentId: string, text: string, version: number): Promise<void> {
  await environment
    .getDatabase()
    .updateTable('documents')
    .set({
      content_json: contentOf(blockIdOf(documentId), text) as never,
      plain_text: text,
      version,
    })
    .where('id', '=', documentId)
    .execute();
}

/** 用于创建初始健康投影后注入三种独立漂移。 */
async function prepareProjectionDrift(): Promise<void> {
  const documents = [missingDocumentId, staleDocumentId, extraDocumentId];
  await environment.insertDocuments(
    documents.map((id, position) => ({ id, knowledgeBaseId, position })),
  );
  for (const id of documents) await writeContent(id, `初始-${id.at(-1)}`, 1);
  await environment.resolveService(SearchProjectionService).scanCurrentDocuments();
  await environment
    .getDatabase()
    .deleteFrom('search_document_projections')
    .where('document_id', '=', missingDocumentId)
    .execute();
  await writeContent(staleDocumentId, '更新后的正文', 2);
  await environment
    .getDatabase()
    .insertInto('search_blocks')
    .values({
      block_id: extraBlockId,
      block_order: 1,
      content_hash: 'f'.repeat(64),
      document_id: extraDocumentId,
      document_version: 1,
      heading_path: [],
      id: '32000000-0000-4000-8000-000000000001',
      owner_id: LOCAL_USER_ID,
      text: '多余块',
    })
    .execute();
}

/** 用于读取投影头与当前块集合。 */
async function readProjection(documentId: string) {
  const projection = await environment
    .getDatabase()
    .selectFrom('search_document_projections')
    .select(['indexed_content_hash', 'indexed_document_version'])
    .where('document_id', '=', documentId)
    .executeTakeFirstOrThrow();
  const blocks = await environment
    .getDatabase()
    .selectFrom('search_blocks')
    .select(['block_id', 'content_hash', 'document_version', 'text'])
    .where('document_id', '=', documentId)
    .orderBy('block_order')
    .execute();
  return { blocks, projection };
}

/** 用于验证一次扫描精确修复三种漂移且删除多余块。 */
async function repairsMissingStaleAndExtraBlocks(): Promise<void> {
  const result = await environment.resolveService(SearchProjectionService).scanCurrentDocuments();
  expect(result.projectedDocuments).toBe(3);
  const missing = await readProjection(missingDocumentId);
  expect(missing.blocks).toHaveLength(1);
  expect(missing.blocks[0]?.text).toBe('初始-2');
  const stale = await readProjection(staleDocumentId);
  expect(stale.projection.indexed_document_version).toBe(2);
  expect(stale.projection.indexed_content_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(stale.blocks).toEqual([
    expect.objectContaining({ document_version: 2, text: '更新后的正文' }),
  ]);
  const extra = await readProjection(extraDocumentId);
  expect(extra.blocks).toHaveLength(1);
  expect(extra.blocks.some(({ block_id }) => block_id === extraBlockId)).toBe(false);
}

/** 用于仅在真实 PostgreSQL 可用时注册投影修复场景。 */
function defineSearchProjectionReconciliationTests(): void {
  beforeAll(async () => {
    await environment.prepareApplication();
    await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: '修复库' }]);
    await prepareProjectionDrift();
  }, 30_000);
  afterAll(() => environment.releaseApplication());
  test('repairs missing stale and extra blocks', repairsMissingStaleAndExtraBlocks);
}

describe.skipIf(databaseUrl === undefined)(
  'search projection reconciliation',
  defineSearchProjectionReconciliationTests,
);
