/**
 * @fileoverview 验证 Tavily 响应映射与错误归类。
 */

import { describe, expect, it, vi } from 'vitest';

import { TavilyWebSearchProvider } from './tavily';

/** 用于构造默认测试 Provider。 */
function createProvider(): TavilyWebSearchProvider {
  return new TavilyWebSearchProvider({ apiKey: 'k', baseUrl: 'https://api.tavily.com' });
}

/** 用于构造返回固定响应的 fetch 替身。 */
function mockFetchOnce(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Response.json(body, { status })),
  );
}

/** 用于断言搜索以稳定错误码拒绝。 */
async function expectUnavailable(provider: TavilyWebSearchProvider): Promise<void> {
  await expect(provider.search({ query: 'q' })).rejects.toMatchObject({
    problem: { code: 'WEB_SEARCH_UNAVAILABLE' },
  });
}

describe('TavilyWebSearchProvider', () => {
  it('把上游结果映射为公开搜索结果并截断摘要', async () => {
    mockFetchOnce(200, {
      results: [
        {
          content: 'x'.repeat(500),
          published_date: '2026-09-01T00:00:00Z',
          title: '标题',
          url: 'https://example.com/a',
        },
      ],
    });
    const results = await createProvider().search({ maxResults: 5, query: 'q' });
    expect(results).toEqual([
      {
        publishedAt: '2026-09-01T00:00:00Z',
        snippet: 'x'.repeat(400),
        title: '标题',
        url: 'https://example.com/a',
      },
    ]);
  });

  it('非 200 响应归类为 WEB_SEARCH_UNAVAILABLE', async () => {
    mockFetchOnce(503, { detail: 'down' });
    await expectUnavailable(createProvider());
  });

  it('非法 JSON 响应归类为 WEB_SEARCH_UNAVAILABLE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('not-json', { status: 200 }))),
    );
    await expectUnavailable(createProvider());
  });

  it('网络失败归类为 WEB_SEARCH_UNAVAILABLE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );
    await expectUnavailable(createProvider());
  });
});
