/** @fileoverview 验证搜索页的请求边界、公开结果渲染与完整恢复状态。 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { SearchResponse, SearchResultItem } from '@everlearn/contracts';
import { afterEach, expect, test, vi } from 'vitest';

import { SearchPage } from './search-page';

const routerReplace = vi.fn();
const leaveSearch = vi.fn();

/** 用于提供搜索页 URL 同步所需的最小 App Router。 */
function createNavigationMock() {
  return {
    /** 用于返回只含 replace 的测试路由。 */
    useRouter: () => ({ replace: routerReplace }),
  };
}

vi.mock('next/navigation', createNavigationMock);

const KNOWLEDGE_BASE_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const BLOCK_ID = '33333333-3333-4333-8333-333333333333';

/** 用于构造安全公开的正文搜索结果。 */
function result(overrides: Partial<SearchResultItem> = {}): SearchResultItem {
  return {
    ancestors: [{ documentId: '44444444-4444-4444-8444-444444444444', title: '架构' }],
    blockId: BLOCK_ID,
    contentSnippet: {
      leadingTruncated: true,
      segments: [
        { highlighted: false, text: '采用 ' },
        { highlighted: true, text: 'outbox' },
      ],
      trailingTruncated: false,
    },
    documentId: DOCUMENT_ID,
    documentTitle: 'Transactional outbox',
    documentVersion: 3,
    headingPath: ['可靠消息'],
    knowledgeBaseId: KNOWLEDGE_BASE_ID,
    knowledgeBaseName: 'Agent 工程',
    matchedField: 'both',
    pathTruncated: false,
    titleSegments: [
      { highlighted: false, text: 'Transactional ' },
      { highlighted: true, text: 'outbox' },
    ],
    updatedAt: '2026-08-25T08:00:00.000Z',
    ...overrides,
  } as SearchResultItem;
}

/** 用于构造搜索分页响应。 */
function searchResponse(overrides: Partial<SearchResponse> = {}): SearchResponse {
  return { indexStatus: 'ready', items: [result()], nextCursor: null, ...overrides };
}

/** 用于返回组件请求适配器可读取的最小响应。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于读取确定测试载荷。 */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** 用于构造当前知识库详情。 */
function knowledgeBaseSummary(): unknown {
  return {
    description: '',
    documentCount: 2,
    id: KNOWLEDGE_BASE_ID,
    kind: 'normal',
    name: 'Agent 工程',
    updatedAt: '2026-08-25T08:00:00.000Z',
    version: 1,
  };
}

/** 用于渲染一个可深链恢复的搜索页面。 */
function renderSearch(initialSearchParams = ''): void {
  render(<SearchPage initialSearchParams={initialSearchParams} onLeave={leaveSearch} />);
}

/** 用于推进防抖时钟并排空请求微任务。 */
async function submitDebouncedSearch(): Promise<void> {
  await act(async () => {
    vi.advanceTimersByTime(301);
    await Promise.resolve();
  });
}

/** 用于切换 JSDOM 的在线快照并发出订阅事件。 */
function setOnline(online: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: online });
  window.dispatchEvent(new Event(online ? 'online' : 'offline'));
}

/** 用于恢复每个场景修改的 DOM、时钟、导航和网络状态。 */
function resetScenario(): void {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  routerReplace.mockReset();
  leaveSearch.mockReset();
  setOnline(true);
}

afterEach(resetScenario);

/** 用于验证全局空查询只展示引导且不触达 Search API。 */
async function skipsEmptyGlobalQuery(): Promise<void> {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  renderSearch();

  expect(screen.getByRole('heading', { level: 1, name: '搜索' })).toBeVisible();
  expect(screen.getByText('输入关键词，查找文档标题与正文内容。')).toBeVisible();
  await act(() => Promise.resolve());
  expect(fetchMock).not.toHaveBeenCalled();
}

/** 用于验证当前库空查询只读范围详情而不触达 Search API。 */
async function readsScopedDetailWithoutSearching(): Promise<void> {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse(knowledgeBaseSummary()));
  vi.stubGlobal('fetch', fetchMock);
  renderSearch(`scope=knowledgeBase&knowledgeBaseId=${KNOWLEDGE_BASE_ID}`);

  expect(await screen.findByText('Agent 工程')).toBeVisible();
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`/api/v1/knowledge-bases/${KNOWLEDGE_BASE_ID}`);
  expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/v1/search'))).toBe(
    false,
  );
}

/** 用于验证结构化高亮始终作为文本节点渲染并生成 Block 定位链接。 */
async function rendersSafeStructuredHighlights(): Promise<void> {
  vi.useFakeTimers();
  const malicious = '<img src=x onerror=alert(1)>';
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      jsonResponse(
        searchResponse({
          items: [
            result({
              documentTitle: malicious,
              titleSegments: [{ highlighted: true, text: malicious }],
            }),
          ],
        }),
      ),
    ),
  );
  renderSearch('query=outbox');
  await submitDebouncedSearch();

  expect(screen.getByText(malicious)).toBeVisible();
  expect(document.querySelector('img')).toBeNull();
  expect(screen.getByText(malicious).closest('mark')).not.toBeNull();
  expect(screen.getByRole('link', { name: malicious })).toHaveAttribute(
    'href',
    `/knowledge/${KNOWLEDGE_BASE_ID}/documents/${DOCUMENT_ID}?searchBlockId=${BLOCK_ID}&searchDocumentVersion=3`,
  );
}

/** 用于验证未收敛索引保留结果并提供显式刷新动作。 */
async function showsUpdatingIndexWithResults(): Promise<void> {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse(searchResponse({ indexStatus: 'updating' }))),
  );
  renderSearch('query=outbox');
  await submitDebouncedSearch();

  expect(screen.getByText('部分最新正文仍在索引')).toBeVisible();
  expect(screen.getByText('Transactional')).toBeVisible();
  expect(screen.getByRole('button', { name: '刷新结果' })).toBeVisible();
}

/** 用于验证分页失败保留已加载结果并允许只重试后续页。 */
async function retainsResultsAfterPaginationFailure(): Promise<void> {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(searchResponse({ nextCursor: 'next-page' })))
    .mockResolvedValueOnce(
      jsonResponse({ code: 'INTERNAL_ERROR', message: '搜索服务暂不可用。', requestId: 'r1' }, 500),
    );
  vi.stubGlobal('fetch', fetchMock);
  renderSearch('query=outbox');
  await submitDebouncedSearch();
  expect(screen.getByText('Transactional')).toBeVisible();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
    await Promise.resolve();
  });
  expect(screen.getByText('搜索服务暂不可用。')).toBeVisible();
  expect(screen.getByText('Transactional')).toBeVisible();
  expect(screen.getByRole('button', { name: '重新读取' })).toBeVisible();
}

/** 用于验证离线冷启动不发送请求且保留可读查询。 */
async function blocksSearchWhileOffline(): Promise<void> {
  vi.useFakeTimers();
  setOnline(false);
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  renderSearch('query=outbox');
  await submitDebouncedSearch();

  expect(screen.getByDisplayValue('outbox')).toBeVisible();
  expect(screen.getByText(/当前离线/)).toBeVisible();
  expect(screen.getByText('离线时无法读取搜索结果')).toBeVisible();
  expect(fetchMock).not.toHaveBeenCalled();
}

/** 用于验证不可访问范围不泄露名称且只允许切换为全部搜索。 */
async function rendersUnavailableScopeWithoutRetry(): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ code: 'NOT_FOUND', message: '知识库不存在。', requestId: 'r1' }, 404),
      ),
  );
  renderSearch(`query=outbox&scope=knowledgeBase&knowledgeBaseId=${KNOWLEDGE_BASE_ID}`);

  expect(await screen.findByText('无法访问此知识库')).toBeVisible();
  expect(screen.queryByText('知识库不存在。')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '重新读取' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '搜索全部知识库' }));
  expect(routerReplace).toHaveBeenCalledWith('/search?query=outbox');
}

/** 用于验证请求内容校验失败不给出无效重试动作。 */
async function doesNotRetryValidationFailure(): Promise<void> {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { code: 'VALIDATION_FAILED', message: '搜索参数无效。', requestId: 'r1' },
          400,
        ),
      ),
  );
  renderSearch('query=outbox');
  await submitDebouncedSearch();

  expect(screen.getByText('搜索参数无效。')).toBeVisible();
  expect(screen.queryByRole('button', { name: '重新读取' })).not.toBeInTheDocument();
}

/** 用于验证范围详情成功后 Search 404 仍归一为不可访问状态。 */
async function normalizesScopedSearchNotFound(): Promise<void> {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(knowledgeBaseSummary()))
    .mockResolvedValueOnce(
      jsonResponse({ code: 'NOT_FOUND', message: '知识库已删除。', requestId: 'r1' }, 404),
    );
  vi.stubGlobal('fetch', fetchMock);
  renderSearch(`query=outbox&scope=knowledgeBase&knowledgeBaseId=${KNOWLEDGE_BASE_ID}`);
  await act(() => Promise.resolve());
  await submitDebouncedSearch();

  expect(screen.getByText('无法访问此知识库')).toBeVisible();
  expect(screen.queryByText('知识库已删除。')).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: '搜索全部知识库' })).toHaveLength(1);
}

/** 用于验证首次请求等待期间只在结果区呈现镜像骨架。 */
function rendersFirstPageSkeleton(): void {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn());
  renderSearch('query=outbox');

  expect(screen.getByRole('status', { name: '正在加载搜索结果' })).toBeVisible();
  expect(screen.getByRole('searchbox')).toHaveValue('outbox');
}

/** 用于验证默认零结果唯一行动会聚焦并选中搜索词。 */
async function recoversFromZeroResults(): Promise<void> {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(searchResponse({ items: [] }))));
  renderSearch('query=outbox');
  await submitDebouncedSearch();

  expect(screen.getByText('没有找到结果')).toBeVisible();
  const input = screen.getByRole('searchbox');
  fireEvent.click(screen.getByRole('button', { name: '调整搜索词' }));
  expect(input).toHaveFocus();
  expect((input as HTMLInputElement).selectionStart).toBe(0);
  expect((input as HTMLInputElement).selectionEnd).toBe(6);
}

/** 用于验证首屏服务失败提供就地重试并恢复结果。 */
async function retriesFirstPageFailure(): Promise<void> {
  vi.useFakeTimers();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({ code: 'INTERNAL_ERROR', message: '搜索暂不可用。', requestId: 'r1' }, 500),
    )
    .mockResolvedValueOnce(jsonResponse(searchResponse()));
  vi.stubGlobal('fetch', fetchMock);
  renderSearch('query=outbox');
  await submitDebouncedSearch();
  expect(screen.getByText('搜索暂不可用。')).toBeVisible();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
    await Promise.resolve();
  });
  expect(screen.getByText('Transactional')).toBeVisible();
}

test('does not request Search API for an empty global query', skipsEmptyGlobalQuery);
test(
  'reads current knowledge-base detail without searching for an empty query',
  readsScopedDetailWithoutSearching,
);
test(
  'renders structured highlights as text and links to the matched block',
  rendersSafeStructuredHighlights,
);
test('keeps results visible while the index is updating', showsUpdatingIndexWithResults);
test('retains loaded results after pagination failure', retainsResultsAfterPaginationFailure);
test('keeps the query readable and blocks requests while offline', blocksSearchWhileOffline);
test('does not disclose an unavailable scoped knowledge base', rendersUnavailableScopeWithoutRetry);
test('does not offer retry for a validation failure', doesNotRetryValidationFailure);
test('normalizes a scoped Search 404 to the unavailable state', normalizesScopedSearchNotFound);
test('renders a mirrored first-page skeleton', rendersFirstPageSkeleton);
test('focuses and selects the query from the default zero state', recoversFromZeroResults);
test('retries a first-page service failure in place', retriesFirstPageFailure);
