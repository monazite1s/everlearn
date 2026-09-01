/**
 * @fileoverview 请求资讯 API 并收窄为本 feature 的局部投影。
 */
// 待后续并入 packages/contracts，禁止在并入前被其他 feature 复用。

import { isRecord, requestApi, type ApiResult } from '../../shared/api-request';

/** 订阅计划的局部投影。 */
export interface NewsSchedule {
  readonly kind: 'daily' | 'weekly';
  readonly time: string;
  readonly timezone: string;
}

/** 订阅列表条目的局部投影。 */
export interface NewsSubscriptionItem {
  readonly createdAt: string;
  readonly feedUrl: string;
  readonly id: string;
  readonly latestRunStatus: string | null;
  readonly name: string;
  readonly newsKnowledgeBaseId: string;
  readonly schedule: NewsSchedule | null;
}

/** 简报运行条目的局部投影。 */
export interface NewsDigestRunItem {
  readonly briefDocumentId: string | null;
  readonly createdAt: string;
  readonly errorCode: string | null;
  readonly id: string;
  readonly status: string;
  readonly subscriptionId: string;
}

const KNOWN_CODES = [
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'NEWS_KB_MISSING',
] as const;
export type NewsApiErrorCode = (typeof KNOWN_CODES)[number];

/** 用于只读取字符串或 null 字段。 */
function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** 用于收窄计划对象。 */
function parseSchedule(value: unknown): NewsSchedule | null {
  if (!isRecord(value)) return null;
  if (value.kind !== 'daily' && value.kind !== 'weekly') return null;
  if (typeof value.time !== 'string' || typeof value.timezone !== 'string') return null;
  return { kind: value.kind, time: value.time, timezone: value.timezone };
}

/** 用于把未知响应收窄为订阅列表投影。 */
export function parseSubscriptionList(value: unknown): NewsSubscriptionItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: NewsSubscriptionItem[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.id !== 'string')
      return undefined;
    items.push({
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
      feedUrl: typeof entry.feedUrl === 'string' ? entry.feedUrl : '',
      id: entry.id,
      latestRunStatus: stringOrNull(entry.latestRunStatus),
      name: entry.name,
      newsKnowledgeBaseId:
        typeof entry.newsKnowledgeBaseId === 'string' ? entry.newsKnowledgeBaseId : '',
      schedule: parseSchedule(entry.schedule),
    });
  }
  return items;
}

/** 用于把未知响应收窄为简报运行列表投影。 */
export function parseDigestRunList(value: unknown): NewsDigestRunItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: NewsDigestRunItem[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string') return undefined;
    items.push({
      briefDocumentId: stringOrNull(entry.briefDocumentId),
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
      errorCode: stringOrNull(entry.errorCode),
      id: entry.id,
      status: typeof entry.status === 'string' ? entry.status : '',
      subscriptionId: typeof entry.subscriptionId === 'string' ? entry.subscriptionId : '',
    });
  }
  return items;
}

/** 用于列出订阅。 */
export function listSubscriptions(): Promise<ApiResult<NewsSubscriptionItem[], NewsApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    networkMessage: '无法连接资讯服务，请稍后重试。',
    parse: parseSubscriptionList,
    url: '/api/v1/news/subscriptions',
  });
}

/** 用于创建订阅。 */
export function createSubscription(input: {
  excludeKeywords: string[];
  feedUrl: string;
  includeKeywords: string[];
  name: string;
  schedule: NewsSchedule | null;
}): Promise<ApiResult<unknown, NewsApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 201,
    init: {
      body: JSON.stringify(input),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
    networkMessage: '无法创建订阅，请稍后重试。',
    /** 用于忽略启动运行响应的无正文结果。 */
    parse: () => ({}),
    url: '/api/v1/news/subscriptions',
  });
}

/** 用于立即运行一次订阅简报。 */
export function runSubscription(
  subscriptionId: string,
): Promise<ApiResult<unknown, NewsApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    init: { headers: { 'content-type': 'application/json' }, method: 'POST' },
    networkMessage: '无法启动简报，请稍后重试。',
    /** 用于忽略启动运行响应的无正文结果。 */
    parse: () => ({}),
    url: `/api/v1/news/subscriptions/${subscriptionId}/run`,
  });
}

/** 用于列出最近简报运行。 */
export function listDigestRuns(): Promise<ApiResult<NewsDigestRunItem[], NewsApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    networkMessage: '无法读取简报记录，请稍后重试。',
    parse: parseDigestRunList,
    url: '/api/v1/news/digest-runs',
  });
}
