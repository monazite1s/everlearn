/**
 * @fileoverview 验证简报执行组装层的入选下标、评级与摘要不错位。
 */

import { describe, expect, it, vi } from 'vitest';

import { buildItemResults, judgeAndCollect } from './news-digest.executor';
import { judgeNewsDigest } from './relevance';
import type { AdoptedEntry } from './news-digest.executor';
import type { FeedItem } from './news-feed';
import type { NewsDigestDispatchItem } from './news-api-client';

vi.mock('./relevance', () => ({
  judgeNewsDigest: vi.fn(),
}));

const dispatchItem = {
  recentItemTitles: [],
  runId: 'run-1',
  seenHashes: [],
  subscription: {
    excludeKeywords: [],
    includeKeywords: [],
    name: '订阅',
    newsKnowledgeBaseId: 'kb-1',
    sources: [],
    topic: '主题',
  },
} as const satisfies NewsDigestDispatchItem;

const config = { apiInternalUrl: 'http://127.0.0.1:9', secret: 'secret' };

/** 用于构造带序号标题的采纳条目夹具。 */
function adoptedEntry(order: number): AdoptedEntry {
  const item = {
    link: `https://example.com/${order}`,
    publishedAt: null,
    sourceType: 'rss',
    summary: `摘要${order}`,
    title: `条目${order}`,
  } as FeedItem;
  return { contentHash: `hash-${order}`, item, normalizedUrl: item.link };
}

/** 用于按 mock 判定结果执行组装层并返回终态条目结果。 */
async function collectItemImportance(
  keepIndexes: number[],
  importanceByIndex: Record<number, 'high' | 'low' | 'normal'>,
  summaryByIndex: Record<number, string>,
) {
  vi.mocked(judgeNewsDigest).mockResolvedValue({
    importanceByIndex: new Map(Object.entries(importanceByIndex).map(([k, v]) => [Number(k), v])),
    keepIndexes: new Set(keepIndexes),
    summaryByIndex: new Map(Object.entries(summaryByIndex).map(([k, v]) => [Number(k), v])),
    warning: null,
  });
  const adopted = [adoptedEntry(0), adoptedEntry(1), adoptedEntry(2)];
  const judged = await judgeAndCollect([...adopted], dispatchItem, config);
  const itemIds = new Map(adopted.map((entry) => [entry.contentHash, `id-${entry.item.title}`]));
  return {
    ...buildItemResults({
      importanceByIndex: judged.importanceByIndex,
      itemIds,
      kept: judged.kept,
      rejected: judged.rejected,
      skipped: [],
      summaryByIndex: judged.summaryByIndex,
    }),
    kept: judged.kept,
  };
}

describe('judgeAndCollect 与 buildItemResults 下标对齐', () => {
  it('被拒条目在首位时评级与摘要仍按原始下标记取', async () => {
    const { itemImportance, kept, rejectedItemIds } = await collectItemImportance(
      [1, 2],
      { 1: 'high', 2: 'low' },
      { 1: '摘要一', 2: '摘要二' },
    );
    expect(kept.map((entry) => entry.sourceIndex)).toEqual([1, 2]);
    expect(itemImportance).toEqual([
      { importance: 'high', itemId: 'id-条目1', processedContent: '摘要一' },
      { importance: 'low', itemId: 'id-条目2', processedContent: '摘要二' },
    ]);
    expect(rejectedItemIds).toEqual(['id-条目0']);
  });

  it('被拒条目在中位时入选评级不串位', async () => {
    const { itemImportance, kept } = await collectItemImportance(
      [0, 2],
      { 0: 'high', 2: 'low' },
      { 0: '摘要零' },
    );
    expect(kept.map((entry) => entry.sourceIndex)).toEqual([0, 2]);
    expect(itemImportance).toEqual([
      { importance: 'high', itemId: 'id-条目0', processedContent: '摘要零' },
      { importance: 'low', itemId: 'id-条目2' },
    ]);
  });
});
