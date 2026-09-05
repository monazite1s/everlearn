/**
 * @fileoverview 实现 GLM Web 搜索 Provider 并把上游失败归类为稳定错误码。
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

/** 用于把 GLM 内容截断为摘要上限长度。 */
function toSnippet(content: unknown): string {
  return typeof content === 'string' ? content.slice(0, MAX_SNIPPET_LENGTH) : '';
}

/** 用于解析 GLM 响应体并把 search_result 条目映射为公开搜索结果。 */
function parseResponse(payload: unknown): WebSearchResult[] {
  const results =
    typeof payload === 'object' &&
    payload !== null &&
    Array.isArray((payload as { search_result?: unknown }).search_result)
      ? (payload as { search_result: unknown[] }).search_result
      : [];
  return results.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const url = [record.link, record.url].find(
      (candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0,
    );
    if (typeof record.title !== 'string' || url === undefined) return [];
    return [
      {
        publishedAt: typeof record.publish_date === 'string' ? record.publish_date : null,
        snippet: toSnippet(record.content),
        title: record.title,
        url,
      },
    ];
  });
}

/** 调用 GLM Web Search API 的 Web 搜索实现。 */
export class GlmWebSearchProvider implements WebSearchProvider {
  /** 用于保存只读端点配置并固定超时上限。 */
  constructor(
    private readonly config: { apiKey: string; baseUrl: string },
    private readonly timeoutMs = REQUEST_TIMEOUT_MS,
  ) {}

  /** 用于执行一次搜索并把非 200、网络与解析失败统一归类。 */
  async search(request: WebSearchRequest): Promise<readonly WebSearchResult[]> {
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl.replace(/\/+$/u, '')}/web_search`, {
        body: JSON.stringify({
          // ponytail: search_std/search_pro 返回 refer 引用而 link 为空，须用夸克引擎拿真实 URL；升级条件为官方 std 引擎补齐链接。
          search_engine: 'search_pro_quark',
          search_query: request.query,
          count: request.maxResults,
        }),
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'content-type': 'application/json',
        },
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
