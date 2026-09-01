/** @fileoverview 验证搜索成功响应的资源与文本安全上限。 */

import type { SearchTitleResult } from '@everlearn/contracts';
import { afterEach, expect, test, vi } from 'vitest';

import { searchDocuments } from './search-api';

/** 用于构造最小合法标题结果。 */
function result(): SearchTitleResult {
  return {
    ancestors: [],
    blockId: null,
    contentSnippet: null,
    documentId: '22222222-2222-4222-8222-222222222222',
    documentTitle: 'Outbox',
    documentVersion: 1,
    headingPath: [],
    knowledgeBaseId: '11111111-1111-4111-8111-111111111111',
    knowledgeBaseName: 'Agent 工程',
    matchedField: 'title',
    pathTruncated: false,
    titleSegments: [{ highlighted: true, text: 'Outbox' }],
    updatedAt: '2026-08-25T08:00:00.000Z',
  };
}

/** 用于执行一项不可信成功响应解析。 */
async function parse(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      /** 用于返回不可信响应的 JSON 正文。 */
      json: () => Promise.resolve(body),
      status: 200,
    }),
  );
  return searchDocuments({ query: 'outbox' }, new AbortController().signal);
}

afterEach(() => vi.unstubAllGlobals());

/** 用于验证每页结果与游标边界。 */
async function rejectsOversizedPageAndCursor(): Promise<void> {
  const oversized = await parse({
    indexStatus: 'ready',
    items: Array(101).fill(result()),
    nextCursor: null,
  });
  expect(oversized.ok).toBe(false);
  const cursor = await parse({
    indexStatus: 'ready',
    items: [],
    nextCursor: `${'a'.repeat(512)}!`,
  });
  expect(cursor.ok).toBe(false);
}

/** 用于验证标题、祖先和公开展示字符串边界。 */
async function rejectsOversizedTitleProjection(): Promise<void> {
  const bad = {
    ...result(),
    ancestors: Array(9).fill({ documentId: result().documentId, title: '路径' }),
    knowledgeBaseName: '库'.repeat(201),
    titleSegments: Array(17).fill({ highlighted: false, text: 'x' }),
  };
  expect((await parse({ indexStatus: 'ready', items: [bad], nextCursor: null })).ok).toBe(false);
}

/** 用于验证正文路径和 Unicode 摘要总量边界。 */
async function rejectsOversizedContentProjection(): Promise<void> {
  const bad = {
    ...result(),
    blockId: '33333333-3333-4333-8333-333333333333',
    contentSnippet: {
      leadingTruncated: false,
      segments: [{ highlighted: true, text: '🙂'.repeat(241) }],
      trailingTruncated: false,
    },
    headingPath: Array(5).fill('标题'.repeat(101)),
    matchedField: 'content',
  };
  expect((await parse({ indexStatus: 'ready', items: [bad], nextCursor: null })).ok).toBe(false);
}

test('rejects oversized result pages and malformed cursors', rejectsOversizedPageAndCursor);
test('rejects oversized title projections', rejectsOversizedTitleProjection);
test('rejects oversized content projections by Unicode length', rejectsOversizedContentProjection);
