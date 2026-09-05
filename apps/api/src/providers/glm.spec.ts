/**
 * @fileoverview 验证 GLM 搜索响应映射与错误归类。
 */

import { describe, expect, it, vi } from 'vitest';

import { GlmWebSearchProvider } from './glm';

/** 用于构造默认测试 Provider。 */
function createProvider(): GlmWebSearchProvider {
  return new GlmWebSearchProvider({ apiKey: 'k', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' });
}

/** 用于构造返回固定响应的 fetch 替身。 */
function mockFetchOnce(status: number, body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Response.json(body, { status })),
  );
}

/** 用于断言搜索以稳定错误码拒绝。 */
async function expectUnavailable(provider: GlmWebSearchProvider): Promise<void> {
  await expect(provider.search({ query: 'q' })).rejects.toMatchObject({
    problem: { code: 'WEB_SEARCH_UNAVAILABLE' },
  });
}

/** 用于构造回显请求体并返回固定 search_result 的 fetch 替身。 */
function mockSearchFetch(searchResult: unknown[]): string[] {
  const capturedBodies: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((_url: unknown, init: { body?: unknown }) => {
      capturedBodies.push(typeof init.body === 'string' ? init.body : '');
      return Response.json({ search_result: searchResult }, { status: 200 });
    }),
  );
  return capturedBodies;
}

/** 用于构造带回退字段与超长内容的搜索结果夹具。 */
const SAMPLE_SEARCH_RESULT = [
  {
    content: 'x'.repeat(500),
    link: 'https://example.com/a',
    publish_date: '2026-09-01',
    title: '标题',
  },
  { content: 'y', title: '备选字段', url: 'https://example.com/b' },
];

describe('GlmWebSearchProvider', () => {
  it('把 search_result 映射为公开搜索结果并截断摘要', expectSearchResultMapping);

  it('丢弃缺少标题或链接的条目', expectInvalidEntriesDropped);

  it('非 200 响应归类为 WEB_SEARCH_UNAVAILABLE', expectUnavailableOnNon200);
  it('非法 JSON 响应归类为 WEB_SEARCH_UNAVAILABLE', expectUnavailableOnBadJson);
  it('网络失败归类为 WEB_SEARCH_UNAVAILABLE', expectUnavailableOnNetworkError);
});

/** 用于断言搜索结果映射、摘要截断与请求体形态。 */
async function expectSearchResultMapping(): Promise<void> {
  const capturedBodies = mockSearchFetch(SAMPLE_SEARCH_RESULT);
  const results = await createProvider().search({ maxResults: 5, query: 'q' });
  expect(results).toEqual([
    {
      publishedAt: '2026-09-01',
      snippet: 'x'.repeat(400),
      title: '标题',
      url: 'https://example.com/a',
    },
    { publishedAt: null, snippet: 'y', title: '备选字段', url: 'https://example.com/b' },
  ]);
  expect(JSON.parse(capturedBodies[0]!)).toEqual({
    count: 5,
    search_engine: 'search_pro_quark',
    search_query: 'q',
  });
}

/** 用于断言缺少标题或链接的条目被丢弃。 */
async function expectInvalidEntriesDropped(): Promise<void> {
  mockFetchOnce(200, {
    search_result: [
      { content: 'x', title: '无链接' },
      { link: 'https://a.com', title: 'ok' },
    ],
  });
  const results = await createProvider().search({ query: 'q' });
  expect(results).toEqual([{ publishedAt: null, snippet: '', title: 'ok', url: 'https://a.com' }]);
}

/** 用于断言非 200 响应以稳定错误码拒绝。 */
async function expectUnavailableOnNon200(): Promise<void> {
  mockFetchOnce(503, { detail: 'down' });
  await expectUnavailable(createProvider());
}

/** 用于断言非法 JSON 响应以稳定错误码拒绝。 */
async function expectUnavailableOnBadJson(): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('not-json', { status: 200 }))),
  );
  await expectUnavailable(createProvider());
}

/** 用于断言网络失败以稳定错误码拒绝。 */
async function expectUnavailableOnNetworkError(): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('offline'))),
  );
  await expectUnavailable(createProvider());
}
