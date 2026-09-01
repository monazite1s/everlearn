/** @fileoverview 为真实浏览器搜索验收准备隔离 PostgreSQL、Nest API 与确定性文档。 */

import { randomUUID } from 'node:crypto';

import { DocumentsTestEnvironment } from '../../apps/api/tests/documents-integration.support';
import { LOCAL_USER_ID } from '../../apps/api/src/identity/local-identity.constants';

export const SEARCH_E2E_API_PORT = 3201;
export const searchBaseId = '62000000-0000-4000-8000-000000000001';
export const searchBodyDocumentId = '63000000-0000-4000-8000-000000000001';
export const searchBodyBlockId = '64000000-0000-4000-8000-000000000001';

export interface SearchFixtureRuntime {
  readonly environment: DocumentsTestEnvironment;
  readonly release: () => Promise<void>;
}

/** 用于生成可按排序稳定断言的标题文档 UUID。 */
function titleDocumentId(sequence: number): string {
  return `63000000-0000-4000-8001-${sequence.toString().padStart(12, '0')}`;
}

/** 用于写入正文定位验收文档的可检索投影。 */
async function seedBodyProjection(environment: DocumentsTestEnvironment): Promise<void> {
  const database = environment.getDatabase();
  await database
    .updateTable('documents')
    .set({
      content_json: {
        content: [
          {
            attrs: { blockId: searchBodyBlockId },
            content: [{ text: 'transactional needle content', type: 'text' }],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      },
      plain_text: 'transactional needle content',
    })
    .where('id', '=', searchBodyDocumentId)
    .execute();
  await database
    .insertInto('search_document_projections')
    .values({
      document_id: searchBodyDocumentId,
      indexed_content_hash: 'a'.repeat(64),
      indexed_document_version: 1,
      owner_id: LOCAL_USER_ID,
    })
    .execute();
  await database
    .insertInto('search_blocks')
    .values({
      block_id: searchBodyBlockId,
      block_order: 0,
      content_hash: 'b'.repeat(64),
      document_id: searchBodyDocumentId,
      document_version: 1,
      heading_path: ['验收章节'],
      id: randomUUID(),
      owner_id: LOCAL_USER_ID,
      text: 'transactional needle content',
    })
    .execute();
}

/** 用于写入标题分页、当前库范围和正文 Block 定位夹具。 */
async function seedSearchFixtures(environment: DocumentsTestEnvironment): Promise<void> {
  await environment.insertKnowledgeBases([{ id: searchBaseId, name: '搜索验收知识库' }]);
  await environment.insertDocuments([
    ...Array.from({ length: 21 }, (_, index) => ({
      id: titleDocumentId(index + 1),
      knowledgeBaseId: searchBaseId,
      position: index,
      title: `outbox note ${String(index + 1).padStart(2, '0')}`,
    })),
    {
      id: searchBodyDocumentId,
      knowledgeBaseId: searchBaseId,
      position: 99,
      title: '正文定位验收',
    },
  ]);
  await seedBodyProjection(environment);
}

/** 用于启动固定端口隔离 API，并返回幂等释放动作。 */
export async function startSearchFixture(): Promise<SearchFixtureRuntime> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for search browser acceptance');
  const suffix = randomUUID().replaceAll('-', '');
  const environment = new DocumentsTestEnvironment(
    `search_e2e_${process.pid}_${suffix}`,
    databaseUrl,
  );
  try {
    await environment.prepareApplication();
    await seedSearchFixtures(environment);
    await environment.listenForBrowser(SEARCH_E2E_API_PORT);
  } catch (error) {
    try {
      await environment.releaseApplication();
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        'Search browser fixture setup and cleanup failed',
      );
    }
    throw error;
  }
  /** 用于释放监听端口、连接池和本测试自有 Schema。 */
  async function release(): Promise<void> {
    await environment.releaseApplication();
  }
  return { environment, release };
}
