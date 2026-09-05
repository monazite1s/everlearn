/**
 * @fileoverview 实现搜索来源的查询构造与 GLM Web 搜索结果到条目的映射。
 */

import type { FeedItem } from './news-feed';
import { searchWeb, type NewsWebSearchResult } from './news-api-client';

const SEARCH_MAX_RESULTS = 8;
const SEARCH_SNIPPET_LIMIT = 1000;

/** 用于按订阅主题与包含关键词构造 1-2 组搜索查询。 */
export function buildSearchQueries(topic: string, includeKeywords: readonly string[]): string[] {
  const extras = includeKeywords.filter((keyword) => keyword !== topic).slice(0, 2);
  // ponytail: 搜索来源 value 目前不参与查询构造，同订阅多个搜索来源会重复同组查询，靠指纹去重兜底；升级条件为需要按来源差异化检索。
  return extras.length === 0 ? [topic] : [topic, `${topic} ${extras.join(' ')}`];
}

/** 用于解析发布时间为 ISO 字符串，无法解析时返回 null。 */
function toPublishedAt(raw: string | null): string | null {
  if (raw === null) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** 用于把单条搜索结果映射为条目形态。 */
function toFeedItem(result: NewsWebSearchResult): FeedItem {
  return {
    link: result.url,
    publishedAt: toPublishedAt(result.publishedAt),
    sourceType: 'search',
    summary: result.snippet.slice(0, SEARCH_SNIPPET_LIMIT),
    title: result.title,
  };
}

/** 用于执行一个搜索来源的查询组并汇总为条目，任一查询抛错由调用方按单来源失败处理。 */
export async function collectSearchEntries(
  config: { apiInternalUrl: string; secret: string },
  input: { includeKeywords: readonly string[]; topic: string },
): Promise<FeedItem[]> {
  const queries = buildSearchQueries(input.topic, input.includeKeywords);
  const groups = await Promise.all(
    queries.map(async (query) =>
      (await searchWeb(config, { maxResults: SEARCH_MAX_RESULTS, query })).map(toFeedItem),
    ),
  );
  return groups.flat();
}
