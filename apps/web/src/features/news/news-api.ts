/**
 * @fileoverview 请求条目流、条目详情、简报与运行详情 API 并收窄为局部投影。
 */
// 条目契约以 packages/contracts 为单一事实源；简报与运行详情仍为局部投影，禁止跨 feature 复用。
// ponytail: 解析容忍未知额外字段，关键字段与枚举严格校验；剩余局部契约并入 contracts 时再收紧为精确键集。

import type {
  NewsItemDetail,
  NewsItemImportance,
  NewsItemSourceType,
  NewsItemSummary,
} from '@everlearn/contracts';
import { isRecord, requestApi, type ApiResult } from '../../shared/api-request';

/** 订阅主题色槽，创建时由服务端在 1..5 内循环分配。 */
export type NewsColorSlot = 1 | 2 | 3 | 4 | 5;
/** 订阅来源类型。 */
export type NewsSourceType = 'rss' | 'site' | 'search';
// 条目契约别名保留给 news feature 既有引用，事实源在 contracts。
export type { NewsItemDetail, NewsItemSummary } from '@everlearn/contracts';
export type { NewsItemImportance as NewsImportance } from '@everlearn/contracts';
export type { NewsItemSourceType as NewsStreamSourceType } from '@everlearn/contracts';
/** 条目过滤条件，任一变化都必须从第一页重读。 */
export interface NewsItemFilters {
  readonly importance?: NewsItemImportance | undefined;
  readonly sourceType?: NewsItemSourceType | undefined;
  readonly subscriptionId?: string | undefined;
}
/** 游标分页响应。 */
export interface NewsPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}
/** 简报按日列表条目投影。 */
export interface NewsDigestSummary {
  readonly digestDate: string;
  readonly documentId: string | null;
  readonly id: string;
  readonly itemCount: number;
  readonly knowledgeBaseId?: string;
  readonly status: string;
  readonly title: string;
  readonly warningCount: number;
}
/** 运行详情里的单条来源决策。 */
export interface NewsRunSourceResult {
  readonly decision: 'adopted' | 'skipped';
  readonly reason: string;
  readonly title: string;
  readonly url: string;
}
/** 发现运行详情投影，用于条目「处理过程」。 */
export interface NewsRunDetail {
  readonly id: string;
  readonly sourceResults: readonly NewsRunSourceResult[];
  readonly status: string;
  readonly warnings: readonly string[];
}

const NEWS_CODES = [
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'VERSION_CONFLICT',
] as const;
export type NewsApiErrorCode = (typeof NEWS_CODES)[number];
export type NewsApiResult<T> = ApiResult<T, NewsApiErrorCode>;

const STREAM_SOURCE_TYPES: readonly NewsItemSourceType[] = ['rss', 'search'];
const IMPORTANCES: readonly NewsItemImportance[] = ['high', 'normal', 'low'];

/** 用于读取字符串字段并容忍缺省。 */
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** 用于读取非负安全整数计数。 */
function count(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/** 用于读取字符串数组且过滤非字符串项。 */
function textList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/** 用于收窄主题色槽并拒绝越界值。 */
function parseColorSlot(value: unknown): NewsColorSlot | undefined {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5
    ? value
    : undefined;
}

/** 用于判断值是否属于批准的字符串枚举。 */
function oneOf<T extends string>(values: readonly T[], value: unknown): T | undefined {
  return typeof value === 'string' && (values as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** 用于收窄条目流摘要投影。 */
function parseItemSummary(entry: unknown): NewsItemSummary | undefined {
  if (!isRecord(entry)) return undefined;
  const sourceType = oneOf(STREAM_SOURCE_TYPES, entry.sourceType);
  const importance = oneOf(IMPORTANCES, entry.importance);
  const colorSlot = parseColorSlot(entry.colorSlot);
  if (
    sourceType === undefined ||
    importance === undefined ||
    colorSlot === undefined ||
    typeof entry.id !== 'string' ||
    typeof entry.title !== 'string'
  ) {
    return undefined;
  }
  return {
    colorSlot,
    discoveredAt: text(entry.discoveredAt),
    id: entry.id,
    importance,
    snippet: text(entry.snippet),
    sourceType,
    subscriptionId: text(entry.subscriptionId),
    title: entry.title,
    topic: text(entry.topic),
    url: text(entry.url),
  };
}

/** 用于收窄条目流分页响应。 */
function parseItemPage(value: unknown): NewsPage<NewsItemSummary> | undefined {
  if (!isRecord(value) || !Array.isArray(value.items)) return undefined;
  const items: NewsItemSummary[] = [];
  for (const entry of value.items) {
    const parsed = parseItemSummary(entry);
    if (parsed === undefined) return undefined;
    items.push(parsed);
  }
  return { items, nextCursor: typeof value.nextCursor === 'string' ? value.nextCursor : null };
}

/** 用于收窄条目详情投影。 */
function parseItemDetail(value: unknown): NewsItemDetail | undefined {
  if (!isRecord(value) || typeof value.processedContent !== 'string') return undefined;
  const summary = parseItemSummary(value);
  if (summary === undefined) return undefined;
  return {
    ...summary,
    discoveredRunId: typeof value.discoveredRunId === 'string' ? value.discoveredRunId : null,
    processedContent: value.processedContent,
    relevance: value.relevance === 'rejected' ? 'rejected' : 'accepted',
  };
}

/** 用于收窄简报列表条目投影。 */
function parseDigest(entry: unknown): NewsDigestSummary | undefined {
  if (
    !isRecord(entry) ||
    typeof entry.id !== 'string' ||
    typeof entry.title !== 'string' ||
    typeof entry.digestDate !== 'string'
  ) {
    return undefined;
  }
  return {
    digestDate: entry.digestDate,
    documentId: typeof entry.documentId === 'string' ? entry.documentId : null,
    id: entry.id,
    itemCount: count(entry.itemCount),
    ...(typeof entry.knowledgeBaseId === 'string'
      ? { knowledgeBaseId: entry.knowledgeBaseId }
      : {}),
    status: text(entry.status),
    title: entry.title,
    warningCount: count(entry.warningCount),
  };
}

/** 用于收窄简报分页响应。 */
function parseDigestPage(value: unknown): NewsPage<NewsDigestSummary> | undefined {
  if (!isRecord(value) || !Array.isArray(value.items)) return undefined;
  const items: NewsDigestSummary[] = [];
  for (const entry of value.items) {
    const parsed = parseDigest(entry);
    if (parsed === undefined) return undefined;
    items.push(parsed);
  }
  return { items, nextCursor: typeof value.nextCursor === 'string' ? value.nextCursor : null };
}

/** 用于收窄单条来源决策投影。 */
function parseSourceResult(entry: unknown): NewsRunSourceResult | undefined {
  if (!isRecord(entry) || typeof entry.title !== 'string' || typeof entry.url !== 'string') {
    return undefined;
  }
  if (entry.decision !== 'adopted' && entry.decision !== 'skipped') return undefined;
  return {
    decision: entry.decision,
    reason: text(entry.reason),
    title: entry.title,
    url: entry.url,
  };
}

/** 用于收窄运行详情投影。 */
function parseRunDetail(value: unknown): NewsRunDetail | undefined {
  if (!isRecord(value) || typeof value.id !== 'string') return undefined;
  const results: NewsRunSourceResult[] = [];
  if (Array.isArray(value.sourceResults)) {
    for (const entry of value.sourceResults) {
      const parsed = parseSourceResult(entry);
      if (parsed === undefined) return undefined;
      results.push(parsed);
    }
  }
  return {
    id: value.id,
    sourceResults: results,
    status: text(value.status),
    warnings: textList(value.warnings),
  };
}

/** 用于把条目过滤编码为同源 GET 查询。 */
function itemPageUrl(filters: NewsItemFilters, cursor?: string): string {
  const params = new URLSearchParams();
  if (filters.subscriptionId) params.set('subscriptionId', filters.subscriptionId);
  if (filters.sourceType) params.set('sourceType', filters.sourceType);
  if (filters.importance) params.set('importance', filters.importance);
  if (cursor) params.set('cursor', cursor);
  const query = params.toString();
  return query ? `/api/v1/news-items?${query}` : '/api/v1/news-items';
}

/** 用于读取一页条目流并支持取消过期请求。 */
export function listNewsItems(
  filters: NewsItemFilters,
  signal: AbortSignal,
  cursor?: string,
): Promise<NewsApiResult<NewsPage<NewsItemSummary>>> {
  return requestApi({
    codes: NEWS_CODES,
    expectedStatus: 200,
    init: { signal },
    networkMessage: '无法连接资讯服务，请检查网络后重试。',
    parse: parseItemPage,
    url: itemPageUrl(filters, cursor),
  });
}

/** 用于读取条目详情。 */
export function getNewsItem(
  itemId: string,
  signal: AbortSignal,
): Promise<NewsApiResult<NewsItemDetail>> {
  return requestApi({
    codes: NEWS_CODES,
    expectedStatus: 200,
    init: { signal },
    networkMessage: '无法连接资讯服务，请检查网络后重试。',
    parse: parseItemDetail,
    url: `/api/v1/news-items/${itemId}`,
  });
}

/** 用于读取简报按日列表。 */
export function listNewsDigests(
  signal: AbortSignal,
  cursor?: string,
): Promise<NewsApiResult<NewsPage<NewsDigestSummary>>> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  return requestApi({
    codes: NEWS_CODES,
    expectedStatus: 200,
    init: { signal },
    networkMessage: '无法连接资讯服务，请检查网络后重试。',
    parse: parseDigestPage,
    url: `/api/v1/news-digests${query}`,
  });
}

/** 用于读取发现运行详情（来源决策与质量警告）。 */
export function getDigestRun(
  runId: string,
  signal: AbortSignal,
): Promise<NewsApiResult<NewsRunDetail>> {
  return requestApi({
    codes: NEWS_CODES,
    expectedStatus: 200,
    init: { signal },
    networkMessage: '无法连接资讯服务，请检查网络后重试。',
    parse: parseRunDetail,
    url: `/api/v1/digest-runs/${runId}`,
  });
}
