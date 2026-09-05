/**
 * @fileoverview 实现资讯条目的 URL 规范化、指纹去重与关键词过滤。
 */

import { createHash } from 'node:crypto';

// 常见跟踪参数与其余 utm_* 一并由 normalizeUrl 剥离。
const TRACKING_PARAM_EXACT = new Set([
  'fbclid',
  'gclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'ref',
  'ref_src',
]);
const MAX_FEED_BYTES = 2_000_000;
const FEED_TIMEOUT_MS = 15_000;

/** 资讯条目的最小投影。 */
export interface FeedItem {
  /** 条目发布时间（ISO 8601，来源缺失时为 null）。 */
  readonly publishedAt?: string | null;
  readonly link: string;
  /** 条目登记时的来源类型。 */
  readonly sourceType: 'rss' | 'search';
  readonly summary: string;
  readonly title: string;
}

/** 用于剥离跟踪参数、排序查询并小写主机，生成稳定规范 URL。 */
export function normalizeUrl(rawUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const kept: [string, string][] = [];
  for (const [key, value] of parsed.searchParams.entries()) {
    const lower = key.toLowerCase();
    if (lower.startsWith('utm_') || TRACKING_PARAM_EXACT.has(lower)) continue;
    kept.push([key, value]);
  }
  kept.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const search = new URLSearchParams(kept);
  return `${parsed.protocol}//${parsed.host.toLowerCase()}${parsed.pathname}${
    search.size === 0 ? '' : `?${search.toString()}`
  }`;
}

/** 用于生成 link+title 的 sha256 内容指纹。 */
export function contentFingerprint(normalizedUrl: string, title: string): string {
  return createHash('sha256').update(`${normalizedUrl}|${title}`).digest('hex');
}

/** 用于按包含/排除关键词过滤条目，排除词命中即丢弃，包含词非空时须命中其一。 */
export function filterByKeywords(
  items: readonly FeedItem[],
  includeKeywords: readonly string[],
  excludeKeywords: readonly string[],
): FeedItem[] {
  /** 用于判断文本是否命中任一关键词。 */
  const matches = (keywords: readonly string[], haystack: string): boolean =>
    keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
  return items.filter((item) => {
    const haystack = `${item.title}\n${item.summary}`.toLowerCase();
    if (matches(excludeKeywords, haystack)) return false;
    return includeKeywords.length === 0 || matches(includeKeywords, haystack);
  });
}

/** 用于抓取并解析 RSS/Atom feed，超时 15 秒且限制响应大小。 */
export async function fetchFeedItems(feedUrl: string): Promise<FeedItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const response = await fetch(feedUrl, { signal: controller.signal });
    if (!response.ok) throw new Error(`feed responded ${response.status}`);
    const text = (await response.text()).slice(0, MAX_FEED_BYTES);
    return await parseFeedXml(text);
  } finally {
    clearTimeout(timer);
  }
}

/** 用于把 feed XML 解析为条目并按发布时间倒序。 */
async function parseFeedXml(xml: string): Promise<FeedItem[]> {
  const { default: Parser } = await import('rss-parser');
  const parsed = await new Parser().parseString(xml);
  return (parsed.items ?? [])
    .map((item) => ({
      link: item.link ?? '',
      publishedAt: item.isoDate ?? null,
      sourceType: 'rss' as const,
      summary: (item.contentSnippet ?? item.content ?? '').slice(0, 1000),
      title: item.title ?? '',
    }))
    .filter((item) => item.link !== '' && item.title !== '')
    .sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
}

/** 条目筛选的输入集合。 */
export interface SelectNewItemsInput {
  readonly excludeKeywords: readonly string[];
  readonly includeKeywords: readonly string[];
  readonly items: readonly FeedItem[];
  readonly limit: number;
  readonly seenHashes: readonly string[];
}

/** 筛选后的入选条目与带原因的落选条目。 */
export interface SelectNewItemsResult {
  readonly adopted: {
    readonly contentHash: string;
    readonly item: FeedItem;
    readonly normalizedUrl: string;
  }[];
  readonly skipped: { readonly item: FeedItem; readonly reason: string }[];
}

/** 用于规范化、去重、关键词过滤并标记落选原因，返回入选与落选明细。 */
export function selectNewItems(input: SelectNewItemsInput): SelectNewItemsResult {
  const seen = new Set(input.seenHashes);
  const batchHashes = new Set<string>();
  const adopted: SelectNewItemsResult['adopted'] = [];
  const skipped: SelectNewItemsResult['skipped'] = [];
  for (const item of input.items) {
    const haystack = `${item.title}\n${item.summary}`.toLowerCase();
    if (input.excludeKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      skipped.push({ item, reason: '关键词排除' });
      continue;
    }
    if (
      input.includeKeywords.length > 0 &&
      !input.includeKeywords.some((keyword) => haystack.includes(keyword.toLowerCase()))
    ) {
      skipped.push({ item, reason: '未命中包含关键词' });
      continue;
    }
    const normalizedUrl = normalizeUrl(item.link);
    if (normalizedUrl === null) {
      skipped.push({ item, reason: '链接无效' });
      continue;
    }
    const contentHash = contentFingerprint(normalizedUrl, item.title);
    if (seen.has(contentHash) || batchHashes.has(contentHash)) {
      skipped.push({ item, reason: '重复' });
      continue;
    }
    if (adopted.length >= input.limit) {
      skipped.push({ item, reason: '超量截断' });
      continue;
    }
    batchHashes.add(contentHash);
    adopted.push({ contentHash, item, normalizedUrl });
  }
  return { adopted, skipped };
}
