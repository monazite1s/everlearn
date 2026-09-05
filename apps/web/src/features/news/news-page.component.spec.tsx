/** @fileoverview 验证资讯页条目流渲染、重要性形状语言、订阅空态与过滤 URL 同步。 */

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
const ITEM_HIGH = '22222222-2222-4222-8222-222222222222';
const ITEM_NORMAL = '33333333-3333-4333-8333-333333333333';
const ITEM_LOW = '44444444-4444-4444-8444-444444444444';

/** 用于返回组件请求适配器可读取的最小响应。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于读取确定测试载荷。 */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** 用于按 URL 前缀路由 fetch 并记录调用。 */
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

/** 用于构造一条订阅投影。 */
function subscription(): unknown {
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
    version: 3,
  };
}

/** 用于构造一条条目流投影。 */
function item(overrides: Record<string, unknown> = {}): unknown {
  return {
    colorSlot: 2,
    discoveredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    id: ITEM_HIGH,
    importance: 'high',
    snippet: '这是摘要内容',
    sourceType: 'rss',
    subscriptionId: SUB_ID,
    title: '默认标题',
    topic: '大模型',
    url: 'https://example.com/a',
    ...overrides,
  };
}

/** 用于准备 Radix Select 在 JSDOM 中的指针交互桩。 */
function enableRadixPointer(): void {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

/** 用于在 Radix Select 中选择一个选项。 */
function selectOption(label: string, name: string): void {
  const trigger = screen.getByRole('combobox', { name: label });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  const option = screen.getByRole('option', { name });
  fireEvent.pointerUp(option, { pointerType: 'mouse' });
  fireEvent.click(option);
}

/** 用于恢复每个场景修改的 DOM、导航和网络状态。 */
function resetScenario(): void {
  cleanup();
  vi.unstubAllGlobals();
  routerBack.mockReset();
  routerPush.mockReset();
  routerReplace.mockReset();
}

afterEach(resetScenario);

/** 用于验证条目流按服务端顺序渲染三档重要性形状与双通道文字。 */
test('renders item stream with importance shape language', async () => {
  stubFetch({
    '/api/v1/news-items': {
      items: [
        item({ id: ITEM_HIGH, importance: 'high', title: '高重要性条目' }),
        item({ id: ITEM_NORMAL, importance: 'normal', title: '普通条目' }),
        item({ id: ITEM_LOW, importance: 'low', title: '低重要性条目' }),
      ],
      nextCursor: null,
    },
    '/api/v1/news-subscriptions': [subscription()],
  });
  render(<NewsPage initialSearchParams="" />);

  expect(await screen.findByText('高重要性条目')).toBeVisible();
  expect(screen.getByText('普通条目')).toBeVisible();
  expect(screen.getByText('低重要性条目')).toBeVisible();
  const highBadge = screen.getByText('高').closest('[data-slot="badge"]');
  expect(highBadge?.className).toContain('bg-foreground');
  expect(screen.getByText('普通').closest('[data-slot="badge"]')).toHaveAttribute(
    'data-variant',
    'outline',
  );
  expect(screen.getByText('重要性：低')).toBeInTheDocument();
  expect(screen.getByText('低重要性条目').closest('[data-slot="badge"]')).toBeNull();
  const highRow = screen.getByText('高重要性条目');
  const normalRow = screen.getByText('普通条目');
  expect(
    highRow.compareDocumentPosition(normalRow) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getAllByText('RSS').length).toBe(3);
  expect(screen.getAllByText('1小时前').length).toBe(3);
  expect(screen.getByText('已加载 3 条资讯条目')).toBeInTheDocument();
});

/** 用于验证无订阅时展示结构化空态并可打开创建弹窗。 */
test('shows no-subscription empty state and opens create dialog', async () => {
  stubFetch({
    '/api/v1/news-items': { items: [], nextCursor: null },
    '/api/v1/news-subscriptions': [],
  });
  render(<NewsPage initialSearchParams="" />);

  expect(await screen.findByText('还没有资讯订阅')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '创建资讯订阅' }));
  expect(await screen.findByRole('dialog', { name: '创建资讯订阅' })).toBeVisible();
  expect(screen.getByText('主题色槽由系统在 1–5 间自动分配')).toBeVisible();
});

/** 用于验证主题过滤写入 URL 并按新过滤条件重读第一页。 */
test('topic filter syncs URL and refetches first page', async () => {
  enableRadixPointer();
  const fetchMock = stubFetch({
    '/api/v1/news-items': { items: [item({ title: '过滤后条目' })], nextCursor: null },
    '/api/v1/news-subscriptions': [subscription()],
  });
  render(<NewsPage initialSearchParams="" />);
  await screen.findByText('过滤后条目');

  selectOption('主题', 'AI 前沿');

  await screen.findByText('过滤后条目');
  expect(routerReplace).toHaveBeenCalledWith(`/news?subscriptionId=${SUB_ID}`);
  expect(
    fetchMock.mock.calls.some(([url]) =>
      String(url).startsWith(`/api/v1/news-items?subscriptionId=${SUB_ID}`),
    ),
  ).toBe(true);
});

/** 用于验证非默认筛选下的零结果只提供清除筛选主行动。 */
test('zero results with filters offer clearing filters', async () => {
  enableRadixPointer();
  stubFetch({
    '/api/v1/news-items': { items: [], nextCursor: null },
    '/api/v1/news-subscriptions': [subscription()],
  });
  render(<NewsPage initialSearchParams={`subscriptionId=${SUB_ID}`} />);
  await screen.findByText('没有匹配的条目');

  fireEvent.click(screen.getByRole('button', { name: '清除筛选' }));

  await screen.findByText('当前时间窗口内暂无条目，稍后再来看看。');
  expect(routerReplace).toHaveBeenCalledWith('/news');
});
