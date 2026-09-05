/**
 * @fileoverview 请求订阅管理 API 并收窄为局部投影。
 */
// 局部契约声明：后端并行施工，以 docs/02-architecture/api-and-events.md 为准；并入 packages/contracts 前禁止跨 feature 复用。

import { isRecord, requestApi, type ApiResult } from '../../shared/api-request';
import type { NewsColorSlot, NewsSourceType } from './news-api';

/** 订阅计划投影。 */
export interface NewsSchedule {
  readonly kind: 'daily' | 'weekly';
  readonly time: string;
  readonly timezone: string;
  readonly weekday: number | null;
}
/** 订阅来源配置。 */
export interface NewsSourceInput {
  readonly type: NewsSourceType;
  readonly value: string;
}
/** 订阅列表投影，包含编辑表单回填所需字段。 */
export interface NewsSubscription {
  readonly colorSlot: NewsColorSlot;
  readonly enabled: boolean;
  readonly excludeKeywords: readonly string[];
  readonly id: string;
  readonly includeKeywords: readonly string[];
  readonly name: string;
  readonly newsKnowledgeBaseId: string | null;
  readonly nextRunAt: string | null;
  readonly schedule: NewsSchedule | null;
  readonly sources: readonly NewsSourceInput[];
  readonly topic: string;
  readonly version: number;
}
/** 创建或更新订阅的载荷，更新时额外提交 version。 */
export interface NewsSubscriptionPayload {
  readonly enabled: boolean;
  readonly excludeKeywords: string[];
  readonly includeKeywords: string[];
  readonly name: string;
  readonly schedule: NewsSchedule | null;
  readonly sources: NewsSourceInput[];
  readonly topic: string;
}

const SUBSCRIPTION_CODES = [
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'VERSION_CONFLICT',
] as const;
/** 订阅 API 的错误码闭集。 */
export type NewsSubscriptionErrorCode = (typeof SUBSCRIPTION_CODES)[number];

const SOURCE_TYPES: readonly NewsSourceType[] = ['rss', 'site', 'search'];

/** 用于读取字符串字段并容忍缺省。 */
function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
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

/** 用于收窄订阅计划投影。 */
function parseSchedule(value: unknown): NewsSchedule | null {
  if (!isRecord(value)) return null;
  const kind = oneOf(['daily', 'weekly'] as const, value.kind);
  if (kind === undefined) return null;
  return {
    kind,
    time: text(value.time),
    timezone: text(value.timezone),
    weekday:
      typeof value.weekday === 'number' && Number.isSafeInteger(value.weekday)
        ? value.weekday
        : null,
  };
}

/** 用于收窄来源配置数组。 */
function parseSources(value: unknown): NewsSourceInput[] {
  if (!Array.isArray(value)) return [];
  const sources: NewsSourceInput[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const type = oneOf(SOURCE_TYPES, entry.type);
    if (type === undefined || typeof entry.value !== 'string') continue;
    sources.push({ type, value: entry.value });
  }
  return sources;
}

/** 用于收窄单条订阅投影。 */
function parseSubscription(entry: unknown): NewsSubscription | undefined {
  if (!isRecord(entry) || typeof entry.id !== 'string') return undefined;
  const colorSlot = parseColorSlot(entry.colorSlot);
  if (colorSlot === undefined) return undefined;
  return {
    colorSlot,
    enabled: entry.enabled !== false,
    excludeKeywords: textList(entry.excludeKeywords),
    id: entry.id,
    includeKeywords: textList(entry.includeKeywords),
    name: text(entry.name),
    newsKnowledgeBaseId:
      typeof entry.newsKnowledgeBaseId === 'string' ? entry.newsKnowledgeBaseId : null,
    nextRunAt: typeof entry.nextRunAt === 'string' ? entry.nextRunAt : null,
    schedule: parseSchedule(entry.schedule),
    sources: parseSources(entry.sources),
    topic: text(entry.topic),
    version:
      typeof entry.version === 'number' && Number.isSafeInteger(entry.version) ? entry.version : 1,
  };
}

/** 用于收窄订阅列表响应。 */
function parseSubscriptionList(value: unknown): NewsSubscription[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: NewsSubscription[] = [];
  for (const entry of value) {
    const parsed = parseSubscription(entry);
    if (parsed === undefined) return undefined;
    items.push(parsed);
  }
  return items;
}

/** 用于列出当前用户订阅。 */
export function listSubscriptions(
  signal: AbortSignal,
): Promise<ApiResult<NewsSubscription[], NewsSubscriptionErrorCode>> {
  return requestApi({
    codes: SUBSCRIPTION_CODES,
    expectedStatus: 200,
    init: { signal },
    networkMessage: '无法连接资讯服务，请稍后重试。',
    parse: parseSubscriptionList,
    url: '/api/v1/news-subscriptions',
  });
}

/** 用于创建订阅。 */
export function createSubscription(
  payload: NewsSubscriptionPayload,
): Promise<ApiResult<unknown, NewsSubscriptionErrorCode>> {
  return requestApi({
    codes: SUBSCRIPTION_CODES,
    expectedStatus: 201,
    init: {
      body: JSON.stringify(payload),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
    networkMessage: '无法创建订阅，请稍后重试。',
    /** 用于忽略创建响应正文，成功后统一重读列表。 */
    parse: () => ({}),
    url: '/api/v1/news-subscriptions',
  });
}

/** 用于更新订阅，必须提交 version 以满足乐观并发。 */
export function updateSubscription(
  subscriptionId: string,
  payload: NewsSubscriptionPayload,
  version: number,
): Promise<ApiResult<unknown, NewsSubscriptionErrorCode>> {
  return requestApi({
    codes: SUBSCRIPTION_CODES,
    expectedStatus: 200,
    init: {
      body: JSON.stringify({ ...payload, version }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    },
    networkMessage: '无法保存订阅，请稍后重试。',
    /** 用于忽略更新响应正文，成功后统一重读列表。 */
    parse: () => ({}),
    url: `/api/v1/news-subscriptions/${subscriptionId}`,
  });
}

/** 用于立即运行一次订阅采集。 */
export function runSubscription(
  subscriptionId: string,
): Promise<ApiResult<unknown, NewsSubscriptionErrorCode>> {
  return requestApi({
    codes: SUBSCRIPTION_CODES,
    expectedStatus: 202,
    // 后端要求 POST 携带 application/json 正文，空 body 会被 415 拒绝。
    init: {
      body: JSON.stringify({}),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
    networkMessage: '无法启动运行，请稍后重试。',
    /** 用于忽略异步运行受理响应正文。 */
    parse: () => ({}),
    url: `/api/v1/news-subscriptions/${subscriptionId}/run`,
  });
}
