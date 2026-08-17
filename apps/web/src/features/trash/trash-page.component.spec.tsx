/** @fileoverview 验证回收站列表、恢复流程、前置引导与移动端只读行为。 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { KnowledgeBaseSummary, TrashItem } from '@everlearn/contracts';
import { afterEach, expect, test, vi } from 'vitest';

import { formatDateTime } from '../../shared/format-datetime';
import { TrashPage } from './trash-page';

const NOTICE = '移动端保留阅读、搜索和运行状态，暂不提供内容创作。';

/** 用于在测试中模拟桌面或移动视口。 */
function stubViewport(desktop: boolean): void {
  window.matchMedia = vi.fn().mockReturnValue({
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: desktop,
    media: '(min-width: 48.0625em)',
    onchange: null,
    removeEventListener: vi.fn(),
  });
}

/** 用于构造 API 组件场景使用的严格回收站条目。 */
function trashItem(overrides: Partial<TrashItem> = {}): TrashItem {
  return {
    deletedAt: '2026-08-17T08:00:00.000000Z',
    id: '22222222-2222-4222-8222-222222222222',
    knowledgeBaseId: '11111111-1111-4111-8111-111111111111',
    knowledgeBaseName: 'Agent 工程',
    objectType: 'document',
    purgeScheduledAt: '2026-09-16T08:00:00.000000Z',
    title: '恢复策略笔记',
    version: 3,
    ...overrides,
  };
}

/** 用于构造恢复端点返回的严格知识库摘要。 */
function knowledgeBaseSummary(id: string): KnowledgeBaseSummary {
  return {
    description: '',
    documentCount: 2,
    id,
    kind: 'normal',
    name: 'Agent 工程',
    updatedAt: '2026-08-17T08:00:00.000000Z',
    version: 4,
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

/** 用于返回文档恢复端点确认的严格详情。 */
function documentDetail(id: string): object {
  return {
    childCount: 1,
    id,
    knowledgeBaseId: '11111111-1111-4111-8111-111111111111',
    parentId: null,
    title: '恢复策略笔记',
    updatedAt: '2026-08-17T08:00:00.000000Z',
    version: 4,
  };
}

/** 用于在桌面视口渲染回收站页面。 */
function renderDesktop(): void {
  stubViewport(true);
  render(<TrashPage mobileNotice={NOTICE} />);
}

/** 用于打开某条目的恢复确认对话框。 */
function openRestoreDialog(label: string): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: label }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByRole('button', { name: '确认恢复' })).toBeVisible();
  return dialog;
}

/** 用于读取请求桩中提交的幂等键。 */
function idempotencyKeyOf(mock: ReturnType<typeof vi.fn>, callIndex: number): string | undefined {
  const init = mock.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string> | undefined)?.['Idempotency-Key'];
}

/** 用于在每个场景后恢复 DOM 与请求状态。 */
function resetScenario(): void {
  cleanup();
  stubViewport(false);
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
}

afterEach(resetScenario);

/** 用于验证混合条目渲染对象类型、归属与两个时间。 */
async function rendersMixedEntriesWithTimes(): Promise<void> {
  const document = trashItem();
  const knowledgeBase = trashItem({
    deletedAt: '2026-08-16T08:00:00.000000Z',
    id: '11111111-1111-4111-8111-111111111111',
    objectType: 'knowledge-base',
    purgeScheduledAt: '2026-09-15T08:00:00.000000Z',
    title: 'Agent 工程',
  });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse({ items: [document, knowledgeBase], nextCursor: null })),
  );
  renderDesktop();

  expect(await screen.findByText('恢复策略笔记')).toBeVisible();
  expect(screen.getByText('Agent 工程')).toBeVisible();
  expect(screen.getByText('文档')).toBeVisible();
  expect(screen.getByText('知识库')).toBeVisible();
  expect(screen.getByText(`原知识库：${document.knowledgeBaseName}`)).toBeVisible();
  expect(screen.getByText(`删除于 ${formatDateTime(document.deletedAt)}`)).toBeVisible();
  expect(screen.getByText(`永久删除于 ${formatDateTime(document.purgeScheduledAt)}`)).toBeVisible();
  expect(screen.getByText(/保留 30 天/)).toBeVisible();
}

/** 用于验证游标加载更多并保留已加载项。 */
async function loadsNextPageWithCursor(): Promise<void> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [trashItem()], nextCursor: 'next-1' }))
    .mockResolvedValueOnce(
      jsonResponse({
        items: [trashItem({ id: 'c', title: '更早删除的文档' })],
        nextCursor: null,
      }),
    );
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  expect(await screen.findByText('恢复策略笔记')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));

  expect(await screen.findByText('更早删除的文档')).toBeVisible();
  expect(screen.getByText('恢复策略笔记')).toBeVisible();
  expect(String(fetchMock.mock.calls[1]?.[0])).toContain('cursor=next-1');
}

/** 用于验证加载更多失败保留已加载条目并可重试。 */
async function retainsItemsAfterPaginationFailure(): Promise<void> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [trashItem()], nextCursor: 'next-1' }))
    .mockResolvedValueOnce(
      jsonResponse({ code: 'INTERNAL_ERROR', message: '暂时无法读取。', requestId: 'r-8' }, 500),
    );
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  expect(await screen.findByText('恢复策略笔记')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));

  expect(await screen.findByText('暂时无法读取。')).toBeVisible();
  expect(screen.getByText('恢复策略笔记')).toBeVisible();
  expect(screen.queryByRole('button', { name: '加载更多' })).not.toBeInTheDocument();
}

/** 用于验证裸冲突经重读对账后关闭对话框并移除脏条目。 */
async function closesDialogAfterBareConflictResync(): Promise<void> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [trashItem()], nextCursor: null }))
    .mockResolvedValueOnce(
      jsonResponse(
        { code: 'CONFLICT', message: '资源当前状态不允许此操作。', requestId: 'r-7' },
        409,
      ),
    )
    .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  expect(await screen.findByText('恢复策略笔记')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '恢复“恢复策略笔记”' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认恢复' }));

  expect(await screen.findByText('回收站是空的')).toBeVisible();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
}

/** 用于验证知识库恢复成功后按服务端重读联动移除其文档条目。 */
async function restoresKnowledgeBaseAndResyncsList(): Promise<void> {
  const knowledgeBaseId = '11111111-1111-4111-8111-111111111111';
  const knowledgeBase = trashItem({
    id: knowledgeBaseId,
    objectType: 'knowledge-base',
    title: 'Agent 工程',
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [knowledgeBase, trashItem()], nextCursor: null }))
    .mockResolvedValueOnce(jsonResponse(knowledgeBaseSummary(knowledgeBaseId)))
    .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  expect(await screen.findByText('恢复策略笔记')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '恢复“Agent 工程”' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认恢复' }));

  expect(await screen.findByText('回收站是空的')).toBeVisible();
  expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
    `/knowledge-bases/${knowledgeBaseId}/restore`,
  );
  expect(String(fetchMock.mock.calls[2]?.[0])).not.toContain('cursor');
}

/** 用于验证同列表知识库未恢复时文档条目展示前置指引。 */
async function guidesDocumentRestoreToKnowledgeBaseFirst(): Promise<void> {
  const knowledgeBaseId = '11111111-1111-4111-8111-111111111111';
  const items = [
    trashItem(),
    trashItem({ id: knowledgeBaseId, objectType: 'knowledge-base', title: 'Agent 工程' }),
  ];
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ items, nextCursor: null })));
  renderDesktop();

  expect(await screen.findByText('恢复策略笔记')).toBeVisible();
  expect(screen.getByText('先恢复其知识库“Agent 工程”')).toBeVisible();
  expect(screen.queryByRole('button', { name: '恢复“恢复策略笔记”' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '恢复“Agent 工程”' })).toBeEnabled();
}

/** 用于验证无法页内判断时由 409 服务端消息兜底并刷新列表。 */
async function fallsBackToServerConflictGuidance(): Promise<void> {
  const knowledgeBaseId = '99999999-9999-4999-8999-999999999999';
  const document = trashItem({ knowledgeBaseId, knowledgeBaseName: '未加载的知识库' });
  const refreshed = [
    document,
    trashItem({ id: knowledgeBaseId, objectType: 'knowledge-base', title: '未加载的知识库' }),
  ];
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [document], nextCursor: null }))
    .mockResolvedValueOnce(
      jsonResponse(
        {
          code: 'KNOWLEDGE_BASE_DELETED',
          message: '原知识库仍在回收站，请先恢复知识库。',
          requestId: 'r1',
        },
        409,
      ),
    )
    .mockResolvedValueOnce(jsonResponse({ items: refreshed, nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  expect(await screen.findByText('恢复策略笔记')).toBeVisible();
  const dialog = openRestoreDialog('恢复“恢复策略笔记”');
  fireEvent.click(within(dialog).getByRole('button', { name: '确认恢复' }));

  expect(await within(dialog).findByText('原知识库仍在回收站，请先恢复知识库。')).toBeVisible();
  expect(await screen.findByText('先恢复其知识库“未加载的知识库”')).toBeVisible();
  expect(fetchMock).toHaveBeenCalledTimes(3);
}

/** 用于验证失败保留条目、幂等键重试复用与成功后丢弃。 */
async function keepsItemAndReusesIdempotencyKey(): Promise<void> {
  const first = trashItem();
  const second = trashItem({ id: 'c', title: '另一份文档', version: 5 });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [first, second], nextCursor: null }))
    .mockResolvedValueOnce(
      jsonResponse({ code: 'INTERNAL_ERROR', message: '服务暂不可用。', requestId: 'r2' }, 500),
    )
    .mockResolvedValueOnce(jsonResponse(documentDetail(first.id)))
    .mockResolvedValueOnce(jsonResponse({ items: [second], nextCursor: null }))
    .mockResolvedValueOnce(jsonResponse(documentDetail(second.id)))
    .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  expect(await screen.findByText('恢复策略笔记')).toBeVisible();
  const dialog = openRestoreDialog('恢复“恢复策略笔记”');
  fireEvent.click(within(dialog).getByRole('button', { name: '确认恢复' }));
  expect(await within(dialog).findByText('服务暂不可用。')).toBeVisible();
  expect(screen.getByText('恢复策略笔记')).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: '确认恢复' }));

  expect(await screen.findByText('另一份文档')).toBeVisible();
  const firstKey = idempotencyKeyOf(fetchMock, 1);
  expect(idempotencyKeyOf(fetchMock, 2)).toBe(firstKey);
  fireEvent.click(screen.getByRole('button', { name: '恢复“另一份文档”' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认恢复' }));

  expect(await screen.findByText('回收站是空的')).toBeVisible();
  expect(idempotencyKeyOf(fetchMock, 4)).not.toBe(firstKey);
}

/** 用于验证空回收站展示结构化空态。 */
async function rendersStructuredEmptyState(): Promise<void> {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ items: [], nextCursor: null })));
  renderDesktop();

  expect(await screen.findByText('回收站是空的')).toBeVisible();
  expect(screen.getByRole('link', { name: '返回知识库' })).toBeVisible();
}

/** 用于验证移动端阅读不提供恢复控件。 */
async function omitsRestoreControlsOnMobile(): Promise<void> {
  const knowledgeBaseId = '11111111-1111-4111-8111-111111111111';
  const items = [
    trashItem(),
    trashItem({ id: knowledgeBaseId, objectType: 'knowledge-base', title: 'Agent 工程' }),
  ];
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ items, nextCursor: null })));
  stubViewport(false);
  render(<TrashPage mobileNotice={NOTICE} />);

  expect(await screen.findByText('恢复策略笔记')).toBeVisible();
  expect(screen.getByText(NOTICE)).toBeVisible();
  expect(screen.queryByRole('button', { name: /恢复/ })).not.toBeInTheDocument();
}

/** 用于验证离线时恢复入口禁用。 */
async function disablesRestoreWhileOffline(): Promise<void> {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse({ items: [trashItem()], nextCursor: null })),
  );
  renderDesktop();

  expect(
    await screen.findByText('当前离线：已加载的回收站条目仍可查看，恢复暂不可用。'),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: '恢复“恢复策略笔记”' })).toBeDisabled();
}

test('renders mixed entries with object type, origin and times', rendersMixedEntriesWithTimes);
test('loads the next page with the opaque cursor', loadsNextPageWithCursor);
test(
  'restores a knowledge base and resyncs the list from the server',
  restoresKnowledgeBaseAndResyncsList,
);
test(
  'guides document restore to its knowledge base first',
  guidesDocumentRestoreToKnowledgeBaseFirst,
);
test(
  'falls back to server conflict guidance when parent is not loaded',
  fallsBackToServerConflictGuidance,
);
test(
  'keeps the item and reuses the idempotency key across retries',
  keepsItemAndReusesIdempotencyKey,
);
test('renders a structured empty state', rendersStructuredEmptyState);
test('omits restore controls on mobile reading', omitsRestoreControlsOnMobile);
test('disables restore while offline', disablesRestoreWhileOffline);
test('retains loaded items after a pagination failure', retainsItemsAfterPaginationFailure);
test('closes the dialog after a bare conflict resync', closesDialogAfterBareConflictResync);
