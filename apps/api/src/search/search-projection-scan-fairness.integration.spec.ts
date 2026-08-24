/** @fileoverview 验证永久非法旧正文不会让补偿扫描后续合法文档饥饿。 */

import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { DocumentsTestEnvironment } from '../../tests/documents-integration.support';
import { LOCAL_USER_ID } from '../identity/local-identity.constants';
import { SearchProjectionService } from './search-projection.service';

const databaseUrl = process.env.DATABASE_URL;
const environment = new DocumentsTestEnvironment(
  `search_scan_fairness_${process.pid}`,
  databaseUrl ?? '',
);
const knowledgeBaseId = '2c000000-0000-4000-8000-000000000001';
const validDocumentId = documentIdOf(101);

/** 用于生成按 UUID 字典序稳定递增的文档标识。 */
function documentIdOf(sequence: number): string {
  return `2d000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;
}

/** 用于批量写入超过单次扫描上限的历史文档。 */
async function insertLegacyDocuments(): Promise<void> {
  await environment.insertDocuments(
    Array.from({ length: 101 }, (_, index) => ({
      id: documentIdOf(index + 1),
      knowledgeBaseId,
      position: index,
    })),
  );
  const invalidContent = {
    content: [{ content: [{ text: '缺少 blockId', type: 'text' }], type: 'paragraph' }],
    type: 'doc',
  };
  await sql`UPDATE documents SET content_json = ${JSON.stringify(invalidContent)}::jsonb,
      plain_text = '缺少 blockId'
    WHERE owner_id = ${LOCAL_USER_ID}::uuid AND id <> ${validDocumentId}::uuid`.execute(
    environment.getDatabase(),
  );
  const validContent = {
    content: [
      {
        attrs: { blockId: '2e000000-0000-4000-8000-000000000001' },
        content: [{ text: '最终可扫描', type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  };
  await sql`UPDATE documents SET content_json = ${JSON.stringify(validContent)}::jsonb,
      plain_text = '最终可扫描' WHERE id = ${validDocumentId}::uuid`.execute(
    environment.getDatabase(),
  );
}

/** 用于验证第二页仍能越过整批永久非法正文并投影合法文档。 */
async function advancesPastPermanentFailures(): Promise<void> {
  const service = environment.resolveService(SearchProjectionService);
  await service.scanCurrentDocuments();
  await service.scanCurrentDocuments();
  const projection = await environment
    .getDatabase()
    .selectFrom('search_document_projections')
    .select(['document_id', 'indexed_document_version'])
    .where('document_id', '=', validDocumentId)
    .executeTakeFirst();
  expect(projection).toMatchObject({ document_id: validDocumentId, indexed_document_version: 1 });
}

/** 用于仅在真实 PostgreSQL 可用时注册扫描公平性回归。 */
function defineSearchScanFairnessTests(): void {
  beforeAll(async () => {
    await environment.prepareApplication();
    await environment.insertKnowledgeBases([{ id: knowledgeBaseId, name: '旧正文扫描' }]);
    await insertLegacyDocuments();
  }, 30_000);
  afterAll(() => environment.releaseApplication());
  test('advances past permanent failures', advancesPastPermanentFailures);
}

describe.skipIf(databaseUrl === undefined)(
  'search projection scan fairness',
  defineSearchScanFairnessTests,
);
