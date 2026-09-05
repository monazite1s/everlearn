/**
 * @fileoverview 验证搜索 Provider 解析、章节依赖调度、大纲解析与 JSON 提取纯函数。
 */

import { afterEach, describe, expect, test, vi } from 'vitest';

import { selectReadyChapters } from '../../../api/src/tutorials/chapter-scheduling';
import { extractJsonObject } from './json-extraction';
import {
  buildResearchQueries,
  parseOutlineJson,
  resolveTutorialWebSearch,
} from './tutorial-research';

describe('chapter-scheduling', () => {
  test('仅无依赖章节可首次领取', () => {
    const pending = [
      { chapterId: '1', dependsOn: [], nodeKey: 'intro', sessionId: 's' },
      { chapterId: '2', dependsOn: ['intro'], nodeKey: 'body', sessionId: 's' },
    ];
    const ready = selectReadyChapters(pending, new Map([['s:body', 'placeholder']]));
    expect(ready.map((chapter) => chapter.chapterId)).toEqual(['1']);
  });

  test('依赖成功后对应章节被释放', () => {
    const pending = [{ chapterId: '2', dependsOn: ['intro'], nodeKey: 'body', sessionId: 's' }];
    expect(selectReadyChapters(pending, new Map([['s:intro', 'running']]))).toHaveLength(0);
    expect(selectReadyChapters(pending, new Map([['s:intro', 'completed']]))).toHaveLength(1);
  });

  test('依赖失败或被取消的章节不会被释放', () => {
    const pending = [{ chapterId: '2', dependsOn: ['intro'], nodeKey: 'body', sessionId: 's' }];
    expect(selectReadyChapters(pending, new Map([['s:intro', 'failed']]))).toHaveLength(0);
    expect(selectReadyChapters(pending, new Map([['s:intro', 'cancelled']]))).toHaveLength(0);
  });
});

describe('tutorial-research', () => {
  test('研究查询为主题加最多三个覆盖词', () => {
    expect(buildResearchQueries('t', ['a', 't', 'b', 'c', 'd'])).toEqual(['t', 'a', 'b', 'c']);
  });

  test('大纲解析容忍栅栏文本并拒绝非 JSON 结构', () => {
    const outline = '前置说明\n```json\n{"chapters":[{"nodeKey":"a"}]}\n```\n后缀';
    expect(parseOutlineJson(outline)).toEqual({ chapters: [{ nodeKey: 'a' }] });
    expect(parseOutlineJson('{"chapters": 1}')).toBeNull();
    expect(parseOutlineJson('没有 JSON')).toBeNull();
  });
});

describe('json-extraction', () => {
  test('提取被前后缀与嵌套花括号包围的对象', () => {
    const text = '前缀 {"a":{"b":"包含 } 花括号"},"c":[1,2]} 后缀';
    expect(extractJsonObject(text)).toEqual({ a: { b: '包含 } 花括号' }, c: [1, 2] });
  });

  test('截断对象补全闭合花括号，无对象文本返回 null', () => {
    expect(extractJsonObject('{"a": {"b": 1}')).toEqual({ a: { b: 1 } });
    expect(extractJsonObject('纯文本回复')).toBeNull();
  });

  test('跳过首个不可解析对象后继续尝试', () => {
    const text = '{"bad": truc} {"chapters":[]}';
    expect(extractJsonObject(text)).toEqual({ chapters: [] });
  });
});

/** GLM web_search 固定响应样例。 */
const GLM_SEARCH_RESPONSE = {
  search_result: [
    {
      content: '片段内容',
      link: 'https://a.example/x',
      publish_date: '2026-09-01',
      title: '标题A',
    },
    { content: 'x'.repeat(500), title: '标题B', url: 'https://b.example/y' },
  ],
};

/** 用于构造返回固定 JSON 的 fetch 替身。 */
function createFetchMock(payload: unknown): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(payload))));
}

/** 用于断言 GLM 请求命中默认端点并携带夸克引擎查询体与超时信号。 */
function expectGlmRequest(mock: ReturnType<typeof vi.fn<typeof fetch>>, query: string): void {
  const [url, init] = mock.mock.calls[0]!;
  expect(url).toBe('https://open.bigmodel.cn/api/paas/v4/web_search');
  expect(JSON.parse(init?.body as string)).toEqual({
    search_engine: 'search_pro_quark',
    search_query: query,
  });
  expect((init?.headers as Record<string, string>).authorization).toBe('Bearer k');
  expect(init?.signal).toBeInstanceOf(AbortSignal);
}

/** 用于按名称读取固定测试配置项。 */
function getFixture(fixtures: Record<string, string>, name: string): string | undefined {
  return fixtures[name];
}

describe('resolveTutorialWebSearch: glm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('调用 web_search 并映射 search_result', async () => {
    const fetchMock = createFetchMock(GLM_SEARCH_RESPONSE);
    vi.stubGlobal('fetch', fetchMock);
    const provider = resolveTutorialWebSearch({
      get: getFixture.bind(null, { SEARCH_API_KEY: 'k', SEARCH_PROVIDER: 'glm' }),
    });
    const results = await provider!.search({ query: 'kysely 教程' });
    expect(fetchMock).toHaveBeenCalledOnce();
    expectGlmRequest(fetchMock, 'kysely 教程');
    expect(results[0]).toEqual({
      publishedAt: '2026-09-01',
      snippet: '片段内容',
      title: '标题A',
      url: 'https://a.example/x',
    });
    expect(results[1]!.snippet).toHaveLength(400);
    expect(results[1]!.url).toBe('https://b.example/y');
  });

  test('GLM_SEARCH_BASE_URL 覆盖默认端点，未配置密钥时返回 undefined', async () => {
    const fetchMock = createFetchMock({ search_result: [] });
    vi.stubGlobal('fetch', fetchMock);
    const base = {
      GLM_SEARCH_BASE_URL: 'https://glm.example/v4/',
      SEARCH_API_KEY: 'k',
      SEARCH_PROVIDER: 'glm',
    };
    const provider = resolveTutorialWebSearch({ get: getFixture.bind(null, base) });
    await provider!.search({ query: 'q' });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://glm.example/v4/web_search');
    expect(
      resolveTutorialWebSearch({ get: getFixture.bind(null, { SEARCH_PROVIDER: 'glm' }) }),
    ).toBeUndefined();
  });

  test('非 200、网络与解析失败映射为稳定中文错误', expectGlmErrorMapping);
});

/** 用于断言 GLM 搜索的非 200、解析与网络失败映射为稳定中文错误。 */
async function expectGlmErrorMapping(): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve(new Response('down', { status: 503 }))),
  );
  const provider = resolveTutorialWebSearch({
    get: getFixture.bind(null, { SEARCH_API_KEY: 'k', SEARCH_PROVIDER: 'glm' }),
  });
  await expect(provider!.search({ query: 'q' })).rejects.toThrow('Web 搜索服务返回错误。');

  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve(new Response('not-json'))),
  );
  await expect(provider!.search({ query: 'q' })).rejects.toThrow('Web 搜索服务响应无法解析。');

  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.reject(new Error('offline'))),
  );
  await expect(provider!.search({ query: 'q' })).rejects.toThrow('无法连接 Web 搜索服务。');
}

describe('resolveTutorialWebSearch: tavily', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('保持原有默认端点', async () => {
    const fetchMock = createFetchMock({ results: [] });
    vi.stubGlobal('fetch', fetchMock);
    const provider = resolveTutorialWebSearch({
      get: getFixture.bind(null, { SEARCH_API_KEY: 'k', SEARCH_PROVIDER: 'tavily' }),
    });
    await provider!.search({ query: 'q' });
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.tavily.com/search');
  });
});
