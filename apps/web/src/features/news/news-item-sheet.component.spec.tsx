/** @fileoverview 验证条目详情 Sheet 的深链、处理过程、焦点归还与失败重试。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
const RUN_ID = '55555555-5555-4555-8555-555555555555';

/** 用于返回组件请求适配器可读取的最小响应。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于读取确定测试载荷。 */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** 用于构造条目详情投影。 */
function detail(overrides: Record<string, unknown> = {}): unknown {
  return {
    colorSlot: 3,
    discoveredAt: '2026-09-04T08:00:00.000Z',
    discoveredRunId: RUN_ID,
    id: ITEM_ID,
    importance: 'high',
    processedContent: '第一段正文。\n\n第二段正文。',
    relevance: 'accepted',
    snippet: '摘要',
    sourceType: 'search',
    subscriptionId: SUB_ID,
    title: 'GLM 发布新版本',
    topic: '大模型',
    url: 'https://example.com/story',
    ...overrides,
  };
}

/** 用于构造发现运行详情投影。 */
function runDetail(): unknown {
  return {
    id: RUN_ID,
    sourceResults: [
      {
        decision: 'adopted',
        reason: '与主题相关',
        title: '相关来源',
        url: 'https://a.example.com',
      },
      {
        decision: 'skipped',
        reason: '重复内容指纹',
        title: '重复来源',
        url: 'https://b.example.com',
      },
    ],
    status: 'succeeded_warning',
    warnings: ['两个来源响应超时，已降级处理。'],
  };
}

/** 用于按 URL 分派条目与运行响应并记录调用。 */
function stubDetailHandlers(detailResponses: unknown[], runResponses: unknown[] = [runDetail()]) {
  const state = { detailCall: 0, runCall: 0 };
  const mock = vi.fn((input: unknown): Promise<Response> => {
    const url = String(input);
    if (url.startsWith(`/api/v1/news-items/${ITEM_ID}`)) {
      return Promise.resolve(jsonResponse(detailResponses[state.detailCall++] ?? detail()));
    }
    if (url.startsWith(`/api/v1/digest-runs/${RUN_ID}`)) {
      return Promise.resolve(jsonResponse(runResponses[state.runCall++] ?? runDetail()));
    }
    if (url.startsWith('/api/v1/news-items')) {
      return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
    }
    return Promise.resolve(jsonResponse([]));
  });
  vi.stubGlobal('fetch', mock);
  return mock;
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

/** 用于验证 ?item 深链直接展开详情并渲染纯文本正文与外域外链。 */
test('deep link opens sheet with processed content and external link', async () => {
  stubDetailHandlers([detail()]);
  render(<NewsPage initialSearchParams={`item=${ITEM_ID}`} />);

  const dialog = await screen.findByRole('dialog');
  expect(await screen.findByText('GLM 发布新版本')).toBeVisible();
  expect(screen.getByText('第一段正文。')).toBeVisible();
  expect(screen.getByText('第二段正文。')).toBeVisible();
  expect(screen.getByText('重要性：高')).toBeVisible();
  expect(screen.getByText('大模型')).toBeVisible();
  const external = screen.getByRole('link', { name: /查看原文/ });
  expect(external).toHaveAttribute('href', 'https://example.com/story');
  expect(external).toHaveAttribute('target', '_blank');
  expect(dialog).toHaveAttribute('role', 'dialog');
});

/** 用于验证处理过程折叠区按需读取来源决策与质量警告。 */
test('processing section loads run decisions lazily', async () => {
  const mock = stubDetailHandlers([detail()]);
  render(<NewsPage initialSearchParams={`item=${ITEM_ID}`} />);
  await screen.findByText('处理过程');
  expect(mock.mock.calls.some(([url]) => String(url).startsWith(`/api/v1/digest-runs/`))).toBe(
    false,
  );

  fireEvent.click(screen.getByText('处理过程'));

  expect(await screen.findByText('本轮处理有质量警告')).toBeVisible();
  expect(screen.getByText('两个来源响应超时，已降级处理。')).toBeVisible();
  expect(screen.getByText('已采纳')).toBeVisible();
  expect(screen.getByText('已跳过')).toBeVisible();
  expect(screen.getByText('重复内容指纹')).toBeVisible();
  expect(
    mock.mock.calls.some(([url]) => String(url).startsWith(`/api/v1/digest-runs/${RUN_ID}`)),
  ).toBe(true);
});

/** 用于验证不存在或不属于当前用户的条目统一不可访问且不提供重试。 */
test('missing item shows unified unavailable state without retry', async () => {
  stubDetailHandlers([{ code: 'NOT_FOUND', message: '资源不存在', requestId: 'r1' }]);
  render(<NewsPage initialSearchParams={`item=${ITEM_ID}`} />);

  expect(await screen.findByText('该条目不存在或不可访问。')).toBeVisible();
  expect(screen.queryByText('GLM 发布新版本')).toBeNull();
  expect(screen.queryByRole('button', { name: '重新读取' })).toBeNull();
});

/** 用于验证详情失败提供就地重试并在成功后渲染正文。 */
test('detail failure offers retry', async () => {
  stubDetailHandlers([
    { code: 'INTERNAL_ERROR', message: '服务暂时不可用', requestId: 'r2' },
    detail(),
  ]);
  render(<NewsPage initialSearchParams={`item=${ITEM_ID}`} />);

  expect(await screen.findByText('条目详情加载失败')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
  expect(await screen.findByText('第一段正文。')).toBeVisible();
});

/** 用于验证查看主题条目应用订阅过滤并关闭详情。 */
test('view topic applies subscription filter', async () => {
  stubDetailHandlers([detail()]);
  render(<NewsPage initialSearchParams={`item=${ITEM_ID}`} />);
  await screen.findByRole('button', { name: '查看主题条目' });

  fireEvent.click(screen.getByRole('button', { name: '查看主题条目' }));

  expect(routerReplace).toHaveBeenCalledWith(`/news?subscriptionId=${SUB_ID}`);
  expect(screen.queryByRole('dialog')).toBeNull();
});

/** 用于构造条目流投影供行触发打开详情。 */
function itemSummary(): unknown {
  return {
    colorSlot: 3,
    discoveredAt: '2026-09-04T08:00:00.000Z',
    id: ITEM_ID,
    importance: 'normal',
    snippet: '摘要',
    sourceType: 'rss',
    subscriptionId: SUB_ID,
    title: '可点击打开的条目',
    topic: '大模型',
    url: 'https://example.com/story',
  };
}

/** 用于验证从条目行打开详情后，关闭时焦点归还到触发行链接。 */
test('closing sheet returns focus to the opened row link', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown): Promise<Response> => {
      const url = String(input);
      if (url.startsWith(`/api/v1/news-items/${ITEM_ID}`)) {
        return Promise.resolve(jsonResponse(detail()));
      }
      if (url.startsWith('/api/v1/news-subscriptions')) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.resolve(jsonResponse({ items: [itemSummary()], nextCursor: null }));
    }),
  );
  render(<NewsPage initialSearchParams="" />);
  const trigger = await screen.findByRole('link', { name: '可点击打开的条目' });

  trigger.focus();
  fireEvent.click(trigger);
  expect(await screen.findByRole('dialog')).toBeVisible();

  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(trigger);
});
