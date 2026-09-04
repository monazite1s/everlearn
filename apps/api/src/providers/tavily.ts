/**
 * @fileoverview 实现 Tavily Web 搜索 Provider 并把上游失败归类为稳定错误码。
 */

import { HttpStatus } from '@nestjs/common';

import { ApiDomainException } from '../http-boundary/api-domain.exception';
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from './web-search';

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_SNIPPET_LENGTH = 400;

/** 用于返回带稳定错误码的 Web 搜索领域拒绝。 */
function webSearchError(message: string): ApiDomainException {
  return new ApiDomainException({
    code: 'WEB_SEARCH_UNAVAILABLE',
    kind: 'domain',
    message,
    status: HttpStatus.BAD_GATEWAY,
  });
}

/** 用于把 Tavily 内容截断为摘要上限长度。 */
function toSnippet(content: unknown): string {
  return typeof content === 'string' ? content.slice(0, MAX_SNIPPET_LENGTH) : '';
}

/** 用于解析 Tavily 响应体并映射为公开搜索结果。 */
function parseResponse(payload: unknown): WebSearchResult[] {
  const results =
    typeof payload === 'object' &&
    payload !== null &&
    Array.isArray(
      (
        payload as {
          results?: unknown;
        }
      ).results,
    )
      ? (payload as { results: unknown[] }).results
      : [];
  return results.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.title !== 'string' || typeof record.url !== 'string') return [];
    return [
      {
        publishedAt: typeof record.published_date === 'string' ? record.published_date : null,
        snippet: toSnippet(record.content),
        title: record.title,
        url: record.url,
      },
    ];
  });
}

/** 调用 Tavily Search API 的 Web 搜索实现。 */
export class TavilyWebSearchProvider implements WebSearchProvider {
  /** 用于保存只读端点配置并固定超时上限。 */
  constructor(
    private readonly config: { apiKey: string; baseUrl: string },
    private readonly timeoutMs = REQUEST_TIMEOUT_MS,
  ) {}

  /** 用于执行一次搜索并把非 200、网络与解析失败统一归类。 */
  async search(request: WebSearchRequest): Promise<readonly WebSearchResult[]> {
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl.replace(/\/+$/u, '')}/search`, {
        body: JSON.stringify({
          api_key: this.config.apiKey,
          exclude_domains: request.excludeDomains,
          include_domains: request.includeDomains,
          max_results: request.maxResults,
          query: request.query,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw webSearchError('无法连接 Web 搜索服务。');
    }
    if (!response.ok) throw webSearchError('Web 搜索服务返回错误。');
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw webSearchError('Web 搜索服务响应无法解析。');
    }
    return parseResponse(payload);
  }
}
