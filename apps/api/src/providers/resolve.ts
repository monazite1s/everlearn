/**
 * @fileoverview 按运行时配置装配可选的 Web 搜索 Provider。
 */

import type { ConfigService } from '@nestjs/config';

import { TavilyWebSearchProvider } from './tavily';
import type { WebSearchProvider } from './web-search';

const DEFAULT_TAVILY_BASE_URL = 'https://api.tavily.com';

/** 用于在搜索配置齐备时返回 Tavily Provider，否则返回 undefined。 */
export function resolveWebSearchProvider(
  configService: ConfigService,
): WebSearchProvider | undefined {
  const provider = configService.get<string>('SEARCH_PROVIDER');
  const apiKey = configService.get<string>('SEARCH_API_KEY');
  if (provider !== 'tavily' || apiKey === undefined || apiKey.length === 0) return undefined;
  const baseUrl =
    configService.get<string>('TAVILY_BASE_URL')?.replace(/\/+$/u, '') ?? DEFAULT_TAVILY_BASE_URL;
  return new TavilyWebSearchProvider({ apiKey, baseUrl });
}
