/**
 * @fileoverview 封装 Worker 调用资讯内部端点的 HTTP 客户端。
 */

const REQUEST_TIMEOUT_MS = 120_000;

/** 资讯运行上下文载荷：订阅配置与近期条目上下文。 */
export interface NewsDigestDispatchItem {
  /** 同订阅近期条目标题，供重要性评定对照。 */
  readonly recentItemTitles: readonly string[];
  readonly runId: string;
  readonly seenHashes: readonly string[];
  readonly subscription: {
    readonly excludeKeywords: readonly string[];
    readonly includeKeywords: readonly string[];
    readonly name: string;
    readonly newsKnowledgeBaseId: string;
    readonly sources: readonly { type: 'rss' | 'search' | 'site'; value: string }[];
    readonly topic: string;
  };
}

/** 资讯计划条目投影。 */
export interface NewsScheduleItem {
  readonly schedule: { kind: string; time: string; timezone: string };
  readonly subscriptionId: string;
}

/** 带稳定错误码的响应失败。 */
export class NewsApiError extends Error {
  /** 用于保存公开错误码供运行终态记录。 */
  constructor(
    readonly errorCode: string,
    message: string,
  ) {
    super(message);
  }
}

/** 用于执行资讯内部请求并把错误信封映射为稳定错误码。 */
async function callInternal(
  config: { apiInternalUrl: string; secret: string },
  path: string,
  init: { body?: unknown; method: 'GET' | 'POST' },
): Promise<unknown> {
  const base = config.apiInternalUrl.replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/api/v1/internal/news${path}`, {
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      headers: { 'content-type': 'application/json', 'x-purge-secret': config.secret },
      method: init.method,
      signal: controller.signal,
    });
    if (response.status === 204) return undefined;
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const record =
        typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
      const code = typeof record.code === 'string' ? record.code : 'NEWS_UPSTREAM_ERROR';
      throw new NewsApiError(code, `news endpoint ${path} responded ${response.status}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** 用于领取一批待执行简报运行。 */
export async function dispatchNewsDigests(
  config: { apiInternalUrl: string; secret: string },
  limit: number,
): Promise<NewsDigestDispatchItem[]> {
  const result = await callInternal(config, '/dispatch', { body: { limit }, method: 'POST' });
  return Array.isArray(result) ? (result as NewsDigestDispatchItem[]) : [];
}

/** 来源决策记录的传输形态。 */
export interface NewsSourceResultPayload {
  readonly decision: 'adopted' | 'skipped';
  readonly reason: string;
  readonly title: string;
  readonly url: string;
}

/** 登记结果单条：指纹到条目 id 的映射。 */
export interface RegisteredNewsItem {
  readonly contentFingerprint: string;
  readonly id: string;
}

/** 用于在发现新条目时登记资讯条目并取回指纹到条目 id 的映射。 */
export async function registerNewsRunItems(
  config: { apiInternalUrl: string; secret: string },
  runId: string,
  items: readonly {
    contentFingerprint: string;
    processedContent?: string;
    publishedAt?: string | null;
    snippet?: string;
    sourceType: 'rss' | 'search';
    title: string;
    url: string;
  }[],
): Promise<RegisteredNewsItem[]> {
  const result = await callInternal(config, `/runs/${runId}/items`, {
    body: { items },
    method: 'POST',
  });
  return Array.isArray(result) ? (result as RegisteredNewsItem[]) : [];
}

/** 用于写入简报运行终态与条目处理结果。 */
export async function completeNewsDigest(
  config: { apiInternalUrl: string; secret: string },
  runId: string,
  input: {
    briefDocumentId?: string;
    errorCode?: string;
    itemImportance?: readonly {
      importance: 'high' | 'low' | 'normal';
      itemId: string;
      processedContent?: string;
    }[];
    rejectedItemIds?: readonly string[];
    sourceResults?: readonly NewsSourceResultPayload[];
    status: 'failed' | 'succeeded';
    warnings?: readonly string[];
  },
): Promise<void> {
  await callInternal(config, `/runs/${runId}/complete`, { body: input, method: 'POST' });
}

/** 用于列出启用计划的订阅。 */
export async function listNewsSchedules(config: {
  apiInternalUrl: string;
  secret: string;
}): Promise<NewsScheduleItem[]> {
  const result = await callInternal(config, '/schedules', { method: 'GET' });
  return Array.isArray(result) ? (result as NewsScheduleItem[]) : [];
}

/** 用于为计划触发创建或复用当天简报运行。 */
export async function createScheduledNewsDigest(
  config: { apiInternalUrl: string; secret: string },
  subscriptionId: string,
): Promise<{ runId: string }> {
  return (await callInternal(config, '/scheduled-runs', {
    body: { subscriptionId },
    method: 'POST',
  })) as { runId: string };
}

/** Web 搜索结果的传输形态。 */
export interface NewsWebSearchResult {
  readonly publishedAt: string | null;
  readonly snippet: string;
  readonly title: string;
  readonly url: string;
}

/** 用于为搜索来源执行一次 Web 搜索并返回公开结果形态。 */
export async function searchWeb(
  config: { apiInternalUrl: string; secret: string },
  input: { maxResults?: number; query: string },
): Promise<readonly NewsWebSearchResult[]> {
  const result = await callInternal(config, '/actions/web-search', {
    body: input,
    method: 'POST',
  });
  return Array.isArray(result) ? (result as NewsWebSearchResult[]) : [];
}

/** 用于把 Workflow 内部端点的错误转换为资讯稳定错误码。 */
export function toNewsErrorCode(error: unknown): string {
  if (error instanceof NewsApiError) return error.errorCode;
  if (typeof error === 'object' && error !== null && 'errorCode' in error) {
    const code: unknown = error.errorCode;
    if (typeof code === 'string') return code;
  }
  return 'NEWS_DIGEST_FAILED';
}
