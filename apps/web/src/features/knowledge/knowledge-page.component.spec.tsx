/** @fileoverview 验证真实知识库列表、创建、恢复和目标读取。 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { KnowledgeBaseSummary } from '@everlearn/contracts';
import type { ReactElement } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

import { KnowledgeDestination } from './knowledge-destination';
import { KnowledgePage } from './knowledge-page';

const routerPush = vi.fn();
const routerReplace = vi.fn();
let mockSearch = '';

/** 用于同步路由替换后的查询参数。 */
function applyMockReplace(url: string): void {
  const query = url.split('?')[1];
  mockSearch = query ?? '';
  routerReplace(url);
}

/** 用于返回创建确认后所需的最小路由接口。 */
function useMockRouter() {
  return { push: routerPush, replace: applyMockReplace };
}

/** 用于为创建入口测试返回确定页面查询参数。 */
function useMockSearchParams(): URLSearchParams {
  return new URLSearchParams(mockSearch);
}

/** 用于只提供当前功能使用的 App Router 接口。 */
function createNavigationMock() {
  return { useRouter: useMockRouter, useSearchParams: useMockSearchParams };
}

vi.mock('next/navigation', createNavigationMock);

/** 用于在页面测试中隔离文档树子模块的网络行为。 */
function createDocumentTreeMock() {
  return {
    /** 用于替代真实文档树的渲染。 */
    DocumentTree: () => null,
  };
}

vi.mock('./document-tree', createDocumentTreeMock);

/** 用于构造 API 组件场景使用的严格公开摘要。 */
function summary(overrides: Partial<KnowledgeBaseSummary> = {}): KnowledgeBaseSummary {
  return {
    description: '围绕 Agent 工程的长期学习资料。',
    documentCount: 2,
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'normal',
    name: 'Agent 工程',
    updatedAt: '2026-08-13T08:00:00.000000Z',
    version: 1,
    ...overrides,
  };
}

/** 用于返回页面适配器所需的最小 Fetch 响应。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于返回无需传输解析的确定响应载荷。 */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** 用于在生产 UI Provider 中渲染功能组件。 */
function renderKnowledge(element: ReactElement): void {
  render(element);
}

/** 用于在每个场景后恢复 DOM、导航、查询和请求状态。 */
function resetScenario(): void {
  cleanup();
  mockSearch = '';
  routerPush.mockReset();
  routerReplace.mockReset();
  vi.unstubAllGlobals();
}

afterEach(resetScenario);

/** 用于验证空持久列表可创建并进入服务端确认目标。 */
async function createsFirstKnowledgeBase(): Promise<void> {
  const created = summary({ documentCount: 0 });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }))
    .mockResolvedValueOnce(jsonResponse(created, 201));
  vi.stubGlobal('fetch', fetchMock);
  renderKnowledge(<KnowledgePage />);

  await screen.findByText('建立你的第一个知识库');
  fireEvent.click(screen.getByRole('button', { name: '新建知识库' }));
  const nameInput = await screen.findByRole('textbox', { name: '名称' });
  fireEvent.change(nameInput, {
    target: { value: ' Agent 工程 ' },
  });
  fireEvent.click(screen.getByRole('button', { name: '创建并进入' }));

  await waitFor(() => expect(routerPush).toHaveBeenCalledWith(`/knowledge/${created.id}`));
  const request = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
  expect(request?.method).toBe('POST');
  expect(request?.body).toBe(JSON.stringify({ name: 'Agent 工程' }));
  expect(typeof request?.body === 'string' ? request.body : '').not.toContain('ownerId');
}

/** 用于验证创建结果不确定时只重读列表且不重放 POST。 */
async function recoversUnknownCreateResult(): Promise<void> {
  const persisted = summary({ name: '网络恢复后的知识库' });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }))
    .mockRejectedValueOnce(new Error('connection closed'))
    .mockResolvedValueOnce(jsonResponse({ items: [persisted], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock);
  renderKnowledge(<KnowledgePage />);

  await screen.findByText('建立你的第一个知识库');
  fireEvent.click(screen.getByRole('button', { name: '新建知识库' }));
  const nameInput = await screen.findByRole('textbox', { name: '名称' });
  fireEvent.change(nameInput, {
    target: { value: '网络恢复后的知识库' },
  });
  fireEvent.click(screen.getByRole('button', { name: '创建并进入' }));

  expect(await screen.findByText('网络恢复后的知识库')).toBeVisible();
  expect(screen.getByRole('textbox', { name: '名称' })).toHaveValue('网络恢复后的知识库');
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect((fetchMock.mock.calls[2]?.[1] as RequestInit | undefined)?.method).toBeUndefined();
  expect(routerPush).not.toHaveBeenCalled();
}

/** 用于验证后续游标失败保留已有项并提供局部重试。 */
async function retainsItemsAfterPaginationFailure(): Promise<void> {
  const first = summary();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [first], nextCursor: 'next-page' }))
    .mockResolvedValueOnce(
      jsonResponse({ code: 'INTERNAL_ERROR', message: '服务暂不可用。', requestId: 'r1' }, 500),
    );
  vi.stubGlobal('fetch', fetchMock);
  renderKnowledge(<KnowledgePage />);

  expect(await screen.findByText('Agent 工程')).toBeVisible();
  expect(screen.getByText('当前账号下的知识库总数')).toBeVisible();
  expect(screen.getByText('各知识库文档数量之和')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
  expect(await screen.findByText('服务暂不可用。')).toBeVisible();
  expect(screen.getByText('Agent 工程')).toBeVisible();
  expect(screen.getByRole('button', { name: '重新读取' })).toBeVisible();
}

/** 用于验证创建后路由每次挂载都读取持久摘要。 */
async function readsPersistedDestination(): Promise<void> {
  const persisted = summary({ documentCount: 0 });
  const fetchMock = vi.fn().mockImplementation(
    /** 用于为每次路由挂载返回新的响应对象。 */
    () => Promise.resolve(jsonResponse(persisted)),
  );
  vi.stubGlobal('fetch', fetchMock);

  const first = render(<KnowledgeDestination knowledgeBaseId={persisted.id} />);
  expect(await screen.findByRole('heading', { level: 1, name: persisted.name })).toBeVisible();
  first.unmount();
  fetchMock.mockClear();
  renderKnowledge(<KnowledgeDestination knowledgeBaseId={persisted.id} />);
  expect(await screen.findByText('0')).toBeVisible();
  expect(screen.getByText('当前知识库内的文档数量')).toBeVisible();
  expect(fetchMock).toHaveBeenCalledOnce();
}

/** 用于验证 URL 参数打开对话框并在关闭时清理。 */
async function opensDialogFromUrlAndCleansParam(): Promise<void> {
  mockSearch = 'create=knowledge-base';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ items: [], nextCursor: null })));
  renderKnowledge(<KnowledgePage />);

  const dialog = await screen.findByRole('dialog', { name: '新建知识库' });
  expect(dialog).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));

  await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/knowledge'));
}

/** 用于验证知识库页提供固定的 Inbox 次级入口。 */
async function linksToInbox(): Promise<void> {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ items: [], nextCursor: null })));
  renderKnowledge(<KnowledgePage />);

  const link = await screen.findByRole('link', { name: 'Inbox' });
  expect(link).toHaveAttribute('href', '/knowledge/inbox');
}

test('creates the first persisted knowledge base', createsFirstKnowledgeBase);
test('recovers an unknown create result without replaying POST', recoversUnknownCreateResult);
test('retains prior items after pagination failure', retainsItemsAfterPaginationFailure);
test(
  'opens the create dialog from URL and cleans the param on close',
  opensDialogFromUrlAndCleansParam,
);
test('links to the fixed inbox entry', linksToInbox);
test('reads the persisted post-create destination on refresh', readsPersistedDestination);
