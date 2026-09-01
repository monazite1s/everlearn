/** @fileoverview 验证搜索页防抖竞态、URL 筛选、分页去重与键盘行为。 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SearchResponse, SearchTitleResult } from '@everlearn/contracts';
import { afterEach, expect, test, vi } from 'vitest';

import { SearchPage } from './search-page';

const routerReplace = vi.fn();
const leaveSearch = vi.fn();

/** 用于提供筛选 URL 同步所需的最小 App Router。 */
function createNavigationMock() {
  return {
    /** 用于返回只含 replace 的测试路由。 */
    useRouter: () => ({ replace: routerReplace }),
  };
}

vi.mock('next/navigation', createNavigationMock);

const KNOWLEDGE_BASE_ID = '11111111-1111-4111-8111-111111111111';

/** 用于构造只命中标题的严格公开结果。 */
function titleResult(documentId: string, title: string): SearchTitleResult {
  return {
    ancestors: [],
    blockId: null,
    contentSnippet: null,
    documentId,
    documentTitle: title,
    documentVersion: 1,
    headingPath: [],
    knowledgeBaseId: KNOWLEDGE_BASE_ID,
    knowledgeBaseName: 'Agent 工程',
    matchedField: 'title',
    pathTruncated: false,
    titleSegments: [{ highlighted: true, text: title }],
    updatedAt: '2026-08-25T08:00:00.000Z',
  };
}

/** 用于构造一页搜索结果。 */
function page(
  items: readonly SearchTitleResult[],
  nextCursor: string | null = null,
): SearchResponse {
  return { indexStatus: 'ready', items, nextCursor };
}

/** 用于返回请求适配器可读取的最小响应。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于读取确定测试载荷。 */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** 用于构造当前库范围读取结果。 */
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

/** 用于构造可由测试控制完成次序的 Promise。 */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>(
    /** 用于捕获外部可控的完成函数。 */ function captureResolve(resolve) {
      resolvePromise = resolve;
    },
  );
  return {
    promise,
    /** 用于按测试指定顺序完成 Promise。 */
    resolve: (value) => resolvePromise?.(value),
  };
}

/** 用于推进搜索防抖并排空响应微任务。 */
async function advanceSearch(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(301);
    await Promise.resolve();
  });
}

/** 用于打开一个 Select 并选择指定选项。 */
function chooseOption(trigger: HTMLElement, name: string): void {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  const option = screen.getByRole('option', { name });
  fireEvent.pointerUp(option, { pointerType: 'mouse' });
  fireEvent.click(option);
}

/** 用于切换 JSDOM 在线快照。 */
function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

/** 用于恢复组件测试中的全局状态。 */
function resetScenario(): void {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  routerReplace.mockReset();
  leaveSearch.mockReset();
  setOnline(true);
}

afterEach(resetScenario);

/** 用于验证迟到旧响应即使忽略 AbortSignal 也无法覆盖新查询。 */
async function ignoresLateSearchResponse(): Promise<void> {
  vi.useFakeTimers();
  const first = deferred<Response>();
  const second = deferred<Response>();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
  );
  render(<SearchPage initialSearchParams="query=first" onLeave={leaveSearch} />);
  await advanceSearch();

  fireEvent.change(screen.getByRole('searchbox', { name: '搜索关键词' }), {
    target: { value: 'second' },
  });
  await advanceSearch();
  await act(
    /** 用于完成新查询并排空状态微任务。 */ async function resolveSecond() {
      second.resolve(
        jsonResponse(page([titleResult('22222222-2222-4222-8222-222222222222', 'Second result')])),
      );
      await Promise.resolve();
    },
  );
  expect(screen.getByText('Second result')).toBeVisible();

  await act(
    /** 用于完成迟到旧查询并排空状态微任务。 */ async function resolveFirst() {
      first.resolve(
        jsonResponse(page([titleResult('33333333-3333-4333-8333-333333333333', 'First result')])),
      );
      await Promise.resolve();
    },
  );
  expect(screen.queryByText('First result')).not.toBeInTheDocument();
  expect(screen.getByText('Second result')).toBeVisible();
}

/** 用于验证筛选写入 URL 且后端只收到公开 API 参数。 */
async function synchronizesFiltersToUrlAndRequest(): Promise<void> {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(page([])));
  vi.stubGlobal('fetch', fetchMock);
  render(<SearchPage initialSearchParams="query=outbox" onLeave={leaveSearch} />);

  chooseOption(screen.getByRole('combobox', { name: '搜索字段' }), '仅标题');
  chooseOption(screen.getByRole('combobox', { name: '更新时间' }), '过去 7 天');
  expect(routerReplace).toHaveBeenLastCalledWith(
    '/search?query=outbox&field=title&updatedWithin=7d',
  );
  await advanceSearch();

  const requested = new URL(String(fetchMock.mock.calls.at(-1)?.[0]), 'https://everlearn.test');
  expect(requested.pathname).toBe('/api/v1/search');
  expect(requested.searchParams.get('field')).toBe('title');
  expect(requested.searchParams.get('updatedAfter')).toMatch(/Z$/);
  expect(requested.searchParams.has('updatedWithin')).toBe(false);
}

/** 用于验证 Enter 不等待防抖且查询 URL 即时反馈。 */
async function submitsImmediatelyOnEnter(): Promise<void> {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(page([])));
  vi.stubGlobal('fetch', fetchMock);
  render(<SearchPage initialSearchParams="" onLeave={leaveSearch} />);
  const input = screen.getByRole('searchbox', { name: '搜索关键词' });

  fireEvent.change(input, { target: { value: 'outbox' } });
  expect(routerReplace).toHaveBeenCalledWith('/search?query=outbox');
  await act(async () => {
    fireEvent.keyDown(input, { key: 'Enter' });
    await Promise.resolve();
  });
  expect(fetchMock).toHaveBeenCalledOnce();
}

/** 用于验证并发更新下分页结果仍按文档身份去重。 */
async function deduplicatesPaginationByDocument(): Promise<void> {
  vi.useFakeTimers();
  const first = titleResult('22222222-2222-4222-8222-222222222222', 'Shared result');
  const next = titleResult('33333333-3333-4333-8333-333333333333', 'Next result');
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(page([first], 'next-page')))
    .mockResolvedValueOnce(jsonResponse(page([first, next])));
  vi.stubGlobal('fetch', fetchMock);
  render(<SearchPage initialSearchParams="query=outbox&updatedWithin=7d" onLeave={leaveSearch} />);
  await advanceSearch();
  const firstUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), 'https://everlearn.test');
  vi.setSystemTime(Date.now() + 60 * 60 * 1000);

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    await Promise.resolve();
  });
  expect(screen.getAllByText('Shared result')).toHaveLength(1);
  expect(screen.getByText('Next result')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Shared result' })).toHaveAttribute(
    'href',
    `/knowledge/${KNOWLEDGE_BASE_ID}/documents/${first.documentId}`,
  );
  const nextUrl = new URL(String(fetchMock.mock.calls[1]?.[0]), 'https://everlearn.test');
  expect(nextUrl.searchParams.get('updatedAfter')).toBe(firstUrl.searchParams.get('updatedAfter'));
}

/** 用于验证离线转换保留已加载结果且停止新请求。 */
async function retainsLoadedResultsOffline(): Promise<void> {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      jsonResponse(page([titleResult('22222222-2222-4222-8222-222222222222', 'Cached result')])),
    );
  vi.stubGlobal('fetch', fetchMock);
  render(<SearchPage initialSearchParams="query=outbox" onLeave={leaveSearch} />);
  await advanceSearch();
  expect(screen.getByText('Cached result')).toBeVisible();

  act(() => setOnline(false));
  expect(screen.getByText('Cached result')).toBeVisible();
  expect(screen.getByText(/当前离线/)).toBeVisible();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'changed' } });
  await advanceSearch();
  expect(fetchMock).toHaveBeenCalledOnce();
}

/** 用于验证离线时已加载结果的所有远程读取动作均显式禁用。 */
async function disablesResultRequestsOffline(): Promise<void> {
  vi.useFakeTimers();
  const response = {
    ...page([titleResult('22222222-2222-4222-8222-222222222222', 'Cached result')], 'next-page'),
    indexStatus: 'updating' as const,
  };
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(response)));
  render(<SearchPage initialSearchParams="query=outbox" onLeave={leaveSearch} />);
  await advanceSearch();

  act(() => setOnline(false));
  expect(screen.getByRole('button', { name: '刷新结果' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '加载更多' })).toBeDisabled();
}

/** 用于验证当前库成功加载后的断网沿用已确认范围和结果。 */
async function retainsScopedResultsOffline(): Promise<void> {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(knowledgeBaseSummary()))
    .mockResolvedValueOnce(
      jsonResponse(page([titleResult('22222222-2222-4222-8222-222222222222', 'Scoped result')])),
    );
  vi.stubGlobal('fetch', fetchMock);
  render(
    <SearchPage
      initialSearchParams={`query=outbox&scope=knowledgeBase&knowledgeBaseId=${KNOWLEDGE_BASE_ID}`}
      onLeave={leaveSearch}
    />,
  );
  await act(() => Promise.resolve());
  await advanceSearch();
  expect(screen.getByText('Scoped result')).toBeVisible();

  act(() => setOnline(false));
  expect(screen.getByText('Scoped result')).toBeVisible();
  expect(screen.queryByText('离线时无法读取搜索结果')).not.toBeInTheDocument();
  expect(screen.getAllByText('Agent 工程').length).toBeGreaterThan(0);
}

/** 用于验证页面级 Escape 尊重已被子控件消费的事件。 */
function leavesOnlyForUnconsumedEscape(): void {
  vi.stubGlobal('fetch', vi.fn());
  render(<SearchPage initialSearchParams="" onLeave={leaveSearch} />);
  const consumed = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' });
  consumed.preventDefault();
  window.dispatchEvent(consumed);
  expect(leaveSearch).not.toHaveBeenCalled();

  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
  expect(leaveSearch).toHaveBeenCalledOnce();
}

test('ignores a late response from an aborted prior query', ignoresLateSearchResponse);
test(
  'synchronizes field and time filters to URL and API request',
  synchronizesFiltersToUrlAndRequest,
);
test('submits immediately on Enter', submitsImmediatelyOnEnter);
test('deduplicates cursor pages by document identity', deduplicatesPaginationByDocument);
test(
  'retains loaded results without new requests after going offline',
  retainsLoadedResultsOffline,
);
test('disables refresh and pagination after going offline', disablesResultRequestsOffline);
test('retains confirmed scoped results after going offline', retainsScopedResultsOffline);
test('leaves only for an unconsumed Escape key', leavesOnlyForUnconsumedEscape);
