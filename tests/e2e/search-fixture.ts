/** @fileoverview 通过真实 HTTP API 种子搜索验收数据并等待投影收敛。 */

import { randomUUID } from 'node:crypto';

import type { APIRequestContext } from '@playwright/test';

import {
  saveDocumentContent,
  seedDocument,
  seedKnowledgeBase,
  waitForSearchResults,
} from './seed-helpers';

/** 搜索验收共享夹具的稳定标识。 */
export interface SearchFixture {
  readonly baseId: string;
  readonly bodyBlockId: string;
  readonly bodyDocumentId: string;
}

/** 用于写入 21 篇标题分页文档与 1 篇正文定位文档并收敛投影。 */
export async function seedSearchFixtures(request: APIRequestContext): Promise<SearchFixture> {
  const baseId = await seedKnowledgeBase(request, '搜索验收知识库');
  // 搜索按更新时间倒序，倒序创建使首页按 note 01 起始稳定排列。
  for (let index = 21; index >= 1; index -= 1) {
    await seedDocument(request, baseId, `outbox note ${String(index).padStart(2, '0')}`);
  }
  const bodyDocumentId = await seedDocument(request, baseId, '正文定位验收');
  const bodyBlockId = randomUUID();
  await saveDocumentContent(request, bodyDocumentId, {
    content: [
      {
        attrs: { blockId: bodyBlockId },
        content: [{ text: 'transactional needle content', type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  });
  // ponytail: 首页分页上限 20 条，收敛判定只要求首页填满，21 条留断言验证加载更多。
  await waitForSearchResults(request, { field: 'title', minItems: 20, text: 'outbox' });
  await waitForSearchResults(request, { field: 'content', minItems: 1, text: 'needle' });
  return { baseId, bodyBlockId, bodyDocumentId };
}
