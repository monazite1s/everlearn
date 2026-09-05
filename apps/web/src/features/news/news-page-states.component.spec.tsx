/** @fileoverview 验证资讯页首屏失败重试、离线降级、请求竞态与简报 tab。 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { NewsPage } from './news-page';

const routerBack = vi.fn();
const routerPush = vi.fn();
const routerReplace = vi.fn();

/** 用于提供资讯页 URL 同步所需的最小 App Router。 */
function createNavigationMock() {
  return {
    /** 用于返回只含 replace/push/back 的测试路由。 */
    useRouter: () => ({ back: routerBack, push: routerPush, replace: routerReplace }),
  };
}

vi.mock('next/navigation', createNavigationMock);

const SUB_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_ID = '22222222-2222-4222-8222-222222222222';
const ITEM_STALE = '33333333-3333-4333-8333-333333333333';

/** 用于返回组件请求适配器可读取的最小响应。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于读取确定测试载荷。 */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** 用于构造一条条目流投影。 */
function item(overrides: Record<string, unknown> = {}): unknown {
  return {
    colorSlot: 1,
    discoveredAt: new Date().toISOString(),
    id: ITEM_ID,
    importance: 'normal',
    snippet: '摘要',
    sourceType: 'rss',
    subscriptionId: SUB_ID,
    title: '条目标题',
    topic: '大模型',
    url: 'https://example.com/a',
    ...overrides,
  };
}

/** 用于构造一条简报投影。 */
function digest(overrides: Record<string, unknown> = {}): unknown {
  return {
    digestDate: '2026-09-04',
    documentId: 'doc-1',
    id: 'digest-1',
    itemCount: 5,
    knowledgeBaseId: 'kb-1',
    status: 'succeeded',
    title: '九月四日资讯简报',
    warningCount: 0,
    ...overrides,
  };
}

/** 用于按 URL 前缀路由 fetch。 */
function stubFetch(handlers: Record<string, unknown>): ReturnType<typeof vi.fn> {
  const mock = vi.fn((input: unknown): Promise<Response> => {
    const url = String(input);
    const match = Object.keys(handlers)
      .filter((prefix) => url.startsWith(prefix))
      .sort((left, right) => right.length - left.length)[0];
    const body = match === undefined ? { code: 'NOT_FOUND', message: '未匹配' } : handlers[match];
    return Promise.resolve(jsonResponse(body));
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

/** 用于切换 JSDOM 的在线快照并发出订阅事件。 */
function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

/** 用于恢复每个场景修改的 DOM、导航和网络状态。 */
function resetScenario(): void {
  cleanup();
  vi.unstubAllGlobals();
  routerBack.mockReset();
  routerPush.mockReset();
  routerReplace.mockReset();
  setOnline(true);
}

afterEach(resetScenario);

/** 用于验证首屏失败保留筛选并提供就地重试。 */
test('first page failure keeps filters and retries in place', async () => {
  const responses: unknown[] = [
    { code: 'INTERNAL_ERROR', message: '服务暂时不可用', requestId: 'r1' },
    { items: [item({ title: '重试后的条目' })], nextCursor: null },
  ];
  let call = 0;
  const mock = vi.fn((input: unknown): Promise<Response> => {
    const url = String(input);
    if (url.startsWith('/api/v1/news-items')) {
      return Promise.resolve(jsonResponse(responses[call++] ?? {}));
    }
    return Promise.resolve(jsonResponse([subscriptionBody()]));
  });
  vi.stubGlobal('fetch', mock);
  render(<NewsPage initialSearchParams="" />);

  expect(await screen.findByText('无法加载条目流')).toBeVisible();
  expect(screen.getByText('服务暂时不可用')).toBeVisible();
  expect(screen.getByRole('combobox', { name: '重要性' })).toBeEnabled();

  fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
  expect(await screen.findByText('重试后的条目')).toBeVisible();
});

/** 用于验证离线时保留已加载条目并禁用过滤与新请求。 */
test('offline keeps loaded items and disables filtering', async () => {
  stubFetch({
    '/api/v1/news-items': { items: [item({ title: '离线前条目' })], nextCursor: null },
    '/api/v1/news-subscriptions': [subscriptionBody()],
  });
  render(<NewsPage initialSearchParams="" />);
  await screen.findByText('离线前条目');

  setOnline(false);

  expect(screen.getByText('离线前条目')).toBeVisible();
  expect(await screen.findByText(/当前离线/)).toBeVisible();
  expect(screen.getByRole('combobox', { name: '主题' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: '重要性' })).toBeDisabled();
});

/** 用于验证过滤变化后迟到响应不得覆盖当前结果。 */
test('late response must not override current filters', async () => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  let releaseFirst: ((response: Response) => void) | undefined;
  const firstCall = new Promise<Response>((resolve) => {
    releaseFirst = resolve;
  });
  const mock = vi.fn((input: unknown): Promise<Response> => {
    const url = String(input);
    if (url.startsWith('/api/v1/news-items?subscriptionId')) {
      return Promise.resolve(
        jsonResponse({ items: [item({ title: '过滤后条目' })], nextCursor: null }),
      );
    }
    if (url.startsWith('/api/v1/news-items')) return firstCall;
    return Promise.resolve(jsonResponse([subscriptionBody()]));
  });
  vi.stubGlobal('fetch', mock);
  render(<NewsPage initialSearchParams="" />);

  const trigger = await screen.findByRole('combobox', { name: '主题' });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  const option = screen.getByRole('option', { name: 'AI 前沿' });
  fireEvent.pointerUp(option, { pointerType: 'mouse' });
  fireEvent.click(option);
  await screen.findByText('过滤后条目');

  releaseFirst?.(
    jsonResponse({ items: [item({ id: ITEM_STALE, title: '迟到的旧条目' })], nextCursor: null }),
  );
  await Promise.resolve();
  expect(screen.queryByText('迟到的旧条目')).toBeNull();
  expect(screen.getByText('过滤后条目')).toBeVisible();
});

/** 用于验证简报 tab 渲染置顶摘要卡与按日列表并链接文档。 */
test('digests tab renders summary card and day list', async () => {
  stubFetch({
    '/api/v1/news-digests': {
      items: [
        digest({ title: '最新简报', warningCount: 2, status: 'succeeded_warning' }),
        digest({
          id: 'digest-2',
          digestDate: '2026-09-03',
          title: '昨日简报',
          documentId: 'doc-2',
        }),
      ],
      nextCursor: null,
    },
    '/api/v1/news-items': { items: [], nextCursor: null },
    '/api/v1/news-subscriptions': [subscriptionBody()],
  });
  render(<NewsPage initialSearchParams="tab=digests" />);

  expect(await screen.findByRole('heading', { name: '最新简报' })).toBeVisible();
  expect(screen.getByText('聚合 5 条资讯条目')).toBeVisible();
  expect(screen.getAllByText('2 项警告').length).toBe(2);
  expect(screen.getAllByText('已完成（有警告）').length).toBe(2);
  expect(screen.getByRole('link', { name: '打开简报' })).toHaveAttribute(
    'href',
    '/knowledge/kb-1/documents/doc-1',
  );
  expect(screen.getByRole('link', { name: /昨日简报/ })).toHaveAttribute(
    'href',
    '/knowledge/kb-1/documents/doc-2',
  );
});

/** 用于构造一条订阅投影。 */
function subscriptionBody(): unknown {
  return {
    colorSlot: 2,
    enabled: true,
    excludeKeywords: [],
    id: SUB_ID,
    includeKeywords: [],
    name: 'AI 前沿',
    newsKnowledgeBaseId: 'kb-1',
    nextRunAt: null,
    schedule: { kind: 'daily', time: '08:00', timezone: 'Asia/Shanghai', weekday: null },
    sources: [{ type: 'rss', value: 'https://example.com/feed.xml' }],
    topic: '大模型',
    version: 1,
  };
}
