/**
 * @fileoverview 实现资讯搜索来源的内部 Web 搜索动作，复用全局搜索 Provider 装配。
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveWebSearchProvider } from '../providers/resolve';
import type { WebSearchResult } from '../providers/web-search';
import { newsError } from './news.service.helpers';

/** 用于提取上游错误类型与报文摘要供结构化日志，不记录任何密钥。 */
function describeUpstreamError(error: unknown): { errorMessage: string; errorType: string } {
  if (error instanceof Error) {
    return { errorMessage: error.message.slice(0, 200), errorType: error.name };
  }
  return { errorMessage: String(error).slice(0, 200), errorType: 'UnknownError' };
}

/** 用于把 Provider 装配与调用收敛为带稳定错误码的内部搜索动作。 */
@Injectable()
export class NewsWebSearchService {
  private readonly provider: ReturnType<typeof resolveWebSearchProvider>;
  private readonly logger = new Logger(NewsWebSearchService.name);

  /** 用于在构造时按运行时配置装配一次搜索 Provider。 */
  constructor(configService: ConfigService<Record<string, string>, false>) {
    this.provider = resolveWebSearchProvider(configService);
  }

  /** 用于执行一次 Web 搜索，Provider 缺失或上游失败时返回稳定领域拒绝。 */
  async search(input: {
    maxResults?: number | undefined;
    query: string;
  }): Promise<readonly WebSearchResult[]> {
    if (this.provider === undefined) {
      throw newsError('NEWS_SEARCH_UNAVAILABLE', '搜索 Provider 未配置，无法采集搜索来源。', 503);
    }
    try {
      return await this.provider.search({
        ...(input.maxResults === undefined ? {} : { maxResults: input.maxResults }),
        query: input.query,
      });
    } catch (error: unknown) {
      this.logger.warn({
        event: 'news.search.upstream.failed',
        query: input.query.slice(0, 100),
        ...describeUpstreamError(error),
      });
      throw newsError('NEWS_SEARCH_FAILED', 'Web 搜索上游失败。', 502);
    }
  }
}
