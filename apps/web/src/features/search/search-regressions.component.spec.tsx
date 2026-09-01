/** @fileoverview 锁定搜索页组合状态、范围深链与延迟焦点回归。 */

import { act, cleanup, render, screen } from '@testing-library/react';
import type { SearchResponse, SearchTitleResult } from '@everlearn/contracts';
import { afterEach, expect, test, vi } from 'vitest';

import { SearchPage } from './search-page';

const routerReplace = vi.fn();
const KNOWLEDGE_BASE_ID = '11111111-1111-4111-8111-111111111111';

/** 用于提供搜索页 URL 同步所需的最小路由。 */
function createNavigationMock() {
  return {
    /** 用于提供搜索页读取的路由替换方法。 */
    useRouter: () => ({ replace: routerReplace }),
  };
}

vi.mock('next/navigation', createNavigationMock);

/** 用于返回组件请求适配器可读取的最小响应。 */
function jsonResponse(body: unknown): Response {
  return {
    /** 用于返回组件请求适配器可读取的 JSON 正文。 */
    json: () => Promise.resolve(body),
    status: 200,
  } as Response;
}

/** 用于构造当前知识库详情。 */
function knowledgeBaseSummary(): unknown {
  return {
    description: '',
    documentCount: 1,
    id: KNOWLEDGE_BASE_ID,
    kind: 'normal',
    name: 'Agent 工程',
    updatedAt: '2026-08-25T08:00:00.000Z',
    version: 1,
  };
}

/** 用于构造当前库缓存结果。 */
function scopedResult(): SearchTitleResult {
  return {
    ancestors: [],
    blockId: null,
    contentSnippet: null,
    documentId: '22222222-2222-4222-8222-222222222222',
    documentTitle: 'Cached result',
    documentVersion: 1,
    headingPath: [],
    knowledgeBaseId: KNOWLEDGE_BASE_ID,
    knowledgeBaseName: 'Agent 工程',
    matchedField: 'title',
    pathTruncated: false,
    titleSegments: [{ highlighted: true, text: 'Cached result' }],
    updatedAt: '2026-08-25T08:00:00.000Z',
  };
}

/** 用于构造搜索响应。 */
function searchResponse(overrides: Partial<SearchResponse> = {}): SearchResponse {
  return { indexStatus: 'ready', items: [scopedResult()], nextCursor: null, ...overrides };
}

/** 用于推进搜索防抖并排空请求微任务。 */
async function advanceSearch(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(301);
    await Promise.resolve();
  });
}

/** 用于切换 JSDOM 在线状态。 */
function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

/** 用于恢复测试场景。 */
function resetScenario(): void {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  routerReplace.mockReset();
  setOnline(true);
}

afterEach(resetScenario);

/** 用于验证零结果与索引更新提示可同时表达。 */
async function showsUpdatingWithZeroResults(): Promise<void> {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse(searchResponse({ indexStatus: 'updating', items: [] }))),
  );
  render(<SearchPage initialSearchParams="query=outbox" onLeave={vi.fn()} />);
  await advanceSearch();

  expect(screen.getByText('部分最新正文仍在索引')).toBeVisible();
  expect(screen.getByText('没有找到结果')).toBeVisible();
  expect(screen.getByRole('button', { name: '调整搜索词' })).toBeVisible();
  expect(screen.getByRole('button', { name: '刷新结果' })).toHaveAttribute(
    'data-variant',
    'outline',
  );
}

/** 用于验证离线缓存范围不能切换到未加载范围。 */
async function disablesSearchAllOffline(): Promise<void> {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(knowledgeBaseSummary()))
      .mockResolvedValueOnce(jsonResponse(searchResponse())),
  );
  render(
    <SearchPage
      initialSearchParams={`query=outbox&scope=knowledgeBase&knowledgeBaseId=${KNOWLEDGE_BASE_ID}`}
      onLeave={vi.fn()}
    />,
  );
  await act(() => Promise.resolve());
  await advanceSearch();
  act(() => setOnline(false));

  expect(screen.getByRole('button', { name: '搜索全部知识库' })).toBeDisabled();
}

/** 用于验证范围就绪只在用户尚未主动聚焦时补交搜索焦点。 */
async function focusesAfterScopedLoadWithoutStealing(): Promise<void> {
  const detail = Promise.withResolvers<Response>();
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(detail.promise));
  render(
    <SearchPage
      initialSearchParams={`scope=knowledgeBase&knowledgeBaseId=${KNOWLEDGE_BASE_ID}`}
      onLeave={vi.fn()}
    />,
  );
  expect(screen.getByRole('searchbox')).toBeDisabled();
  await act(async () => {
    detail.resolve(jsonResponse(knowledgeBaseSummary()));
    await Promise.resolve();
  });
  expect(screen.getByRole('searchbox')).toHaveFocus();

  cleanup();
  const second = Promise.withResolvers<Response>();
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(second.promise));
  render(
    <SearchPage
      initialSearchParams={`scope=knowledgeBase&knowledgeBaseId=${KNOWLEDGE_BASE_ID}`}
      onLeave={vi.fn()}
    />,
  );
  screen.getByRole('button', { name: '返回' }).focus();
  await act(async () => {
    second.resolve(jsonResponse(knowledgeBaseSummary()));
    await Promise.resolve();
  });
  expect(screen.getByRole('button', { name: '返回' })).toHaveFocus();
}

/** 用于验证非法范围深链不发详情请求并提供唯一恢复行动。 */
async function rejectsInvalidScopedLinks(): Promise<void> {
  for (const search of [
    'query=outbox&scope=knowledgeBase&knowledgeBaseId=not-a-uuid',
    `query=outbox&scope=knowledgeBase&knowledgeBaseId=${KNOWLEDGE_BASE_ID}&knowledgeBaseId=${KNOWLEDGE_BASE_ID}`,
  ]) {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const view = render(<SearchPage initialSearchParams={search} onLeave={vi.fn()} />);
    expect(await screen.findByText('无法访问此知识库')).toBeVisible();
    expect(screen.getAllByRole('button', { name: '搜索全部知识库' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '重新读取' })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    view.unmount();
  }
}

test('shows index updating alongside a zero result state', showsUpdatingWithZeroResults);
test('disables changing a retained scoped cache while offline', disablesSearchAllOffline);
test(
  'focuses after scoped load without stealing user focus',
  focusesAfterScopedLoadWithoutStealing,
);
test('rejects invalid and repeated scoped knowledge-base links', rejectsInvalidScopedLinks);
