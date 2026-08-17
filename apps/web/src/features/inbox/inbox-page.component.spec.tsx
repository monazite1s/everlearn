/** @fileoverview 验证 Inbox 记录、分页、删除与移动端只读行为。 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { InboxItemSummary } from '@everlearn/contracts';
import { afterEach, expect, test, vi } from 'vitest';

import { InboxPage } from './inbox-page';

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

/** 用于构造 API 组件场景使用的严格公开摘要。 */
function summary(overrides: Partial<InboxItemSummary> = {}): InboxItemSummary {
  return {
    content: '读到的观点：慢就是快。',
    createdAt: '2026-08-17T08:00:00.000000Z',
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'text',
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

/** 用于在桌面视口渲染 Inbox 页面。 */
function renderDesktop(): void {
  stubViewport(true);
  render(<InboxPage mobileNotice={NOTICE} />);
}

/** 用于在移动视口渲染 Inbox 页面。 */
function renderMobile(): void {
  stubViewport(false);
  render(<InboxPage mobileNotice={NOTICE} />);
}

/** 用于填写快速记录输入。 */
async function fillContent(value: string): Promise<HTMLElement> {
  const input = await screen.findByRole('textbox', { name: '内容' });
  fireEvent.change(input, { target: { value } });
  return input;
}

/** 用于在每个场景后恢复 DOM 与请求状态。 */
function resetScenario(): void {
  cleanup();
  stubViewport(false);
  vi.unstubAllGlobals();
}

afterEach(resetScenario);

/** 用于验证空 Inbox 可记录文本并由服务端确认后置顶。 */
async function recordsTextFromEmptyInbox(): Promise<void> {
  const created = summary({
    content: ' 读完某文的笔记 ',
    id: '33333333-3333-4333-8333-333333333333',
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }))
    .mockResolvedValueOnce(jsonResponse(created, 201));
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  expect(await screen.findByText('Inbox 还是空的')).toBeVisible();
  const input = await fillContent(' 读完某文的笔记 ');
  fireEvent.click(screen.getByRole('button', { name: '记录' }));

  expect(await screen.findByText('读完某文的笔记')).toBeVisible();
  expect(screen.getByText('文本')).toBeVisible();
  expect(input).toHaveValue('');
  const request = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
  expect(request?.method).toBe('POST');
  expect(request?.body).toBe(JSON.stringify({ text: '读完某文的笔记' }));
}

/** 用于验证单行 http 链接按 URL 载荷记录。 */
async function recordsSingleLineUrlAsLink(): Promise<void> {
  const url = 'https://example.com/article?id=1';
  const created = summary({
    content: url,
    id: '44444444-4444-4444-8444-444444444444',
    kind: 'url',
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }))
    .mockResolvedValueOnce(jsonResponse(created, 201));
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  await fillContent(url);
  fireEvent.click(screen.getByRole('button', { name: '记录' }));

  expect(await screen.findByText(url)).toBeVisible();
  expect(screen.getByText('链接')).toBeVisible();
  const request = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
  expect(request?.body).toBe(JSON.stringify({ url }));
}

/** 用于验证无法解析的链接式输入得到字段提示且不发起提交。 */
async function rejectsBrokenUrlWithFieldError(): Promise<void> {
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  await fillContent('https://example.com 阅读备注');
  expect(
    await screen.findByText(
      '以 http(s):// 开头的单行内容将按链接记录：请补全链接，或另起一行按文本记录。',
    ),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: '记录' })).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
}

/** 用于验证链接加换行备注的混合内容按文本记录。 */
async function treatsMultiLineUrlNoteAsText(): Promise<void> {
  const created = summary({
    content: 'https://example.com/a\n备注',
    id: '55555555-5555-4555-8555-555555555555',
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }))
    .mockResolvedValueOnce(jsonResponse(created, 201));
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  await fillContent('https://example.com/a\n备注');
  fireEvent.click(screen.getByRole('button', { name: '记录' }));

  expect(await screen.findByText('文本')).toBeVisible();
  const request = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
  expect(request?.body).toBe(JSON.stringify({ text: 'https://example.com/a\n备注' }));
}

/** 用于验证提交失败保留输入并展示原因。 */
async function keepsInputAfterFailedSubmit(): Promise<void> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }))
    .mockResolvedValueOnce(
      jsonResponse({ code: 'INTERNAL_ERROR', message: '服务暂不可用。', requestId: 'r1' }, 500),
    );
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  const input = await fillContent('尚未保存的想法');
  fireEvent.click(screen.getByRole('button', { name: '记录' }));

  expect(await screen.findByText('服务暂不可用。')).toBeVisible();
  expect(screen.getByText('记录失败')).toBeVisible();
  expect(input).toHaveValue('尚未保存的想法');
}

/** 用于验证创建结果不确定时只重读列表且不重放提交。 */
async function resyncsListAfterUnknownCreateOutcome(): Promise<void> {
  const persisted = summary({ content: '网络恢复后的记录' });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }))
    .mockRejectedValueOnce(new Error('connection closed'))
    .mockResolvedValueOnce(jsonResponse({ items: [persisted], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  const input = await fillContent('网络恢复后的记录');
  fireEvent.click(screen.getByRole('button', { name: '记录' }));

  expect(await screen.findByText('网络恢复后的记录')).toBeVisible();
  expect(input).toHaveValue('网络恢复后的记录');
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect((fetchMock.mock.calls[2]?.[1] as RequestInit | undefined)?.method).toBeUndefined();
}

/** 用于验证游标加载更多并保留已加载项。 */
async function loadsNextPageWithCursor(): Promise<void> {
  const first = summary();
  const second = summary({
    content: '稍早的一条记录',
    id: '66666666-6666-4666-8666-666666666666',
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [first], nextCursor: 'next-1' }))
    .mockResolvedValueOnce(jsonResponse({ items: [second], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  expect(await screen.findByText('读到的观点：慢就是快。')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));

  expect(await screen.findByText('稍早的一条记录')).toBeVisible();
  expect(screen.getByText('读到的观点：慢就是快。')).toBeVisible();
  expect(String(fetchMock.mock.calls[1]?.[0])).toContain('cursor=next-1');
}

/** 用于验证带尾随换行的链接仍按 URL 载荷记录。 */
async function recordsTrailingNewlineUrlAsLink(): Promise<void> {
  const url = 'https://example.com/article?id=1';
  const created = summary({
    content: url,
    id: '55555555-5555-4555-8555-555555555555',
    kind: 'url',
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }))
    .mockResolvedValueOnce(jsonResponse(created, 201));
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  await fillContent(`${url}\n`);
  fireEvent.click(screen.getByRole('button', { name: '记录' }));

  expect(await screen.findByText(url)).toBeVisible();
  const request = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
  expect(request?.body).toBe(JSON.stringify({ url }));
}

/** 用于验证加载更多失败时保留已加载记录并可重试。 */
async function retainsItemsAfterPaginationFailure(): Promise<void> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [summary()], nextCursor: 'next-1' }))
    .mockResolvedValueOnce(
      jsonResponse({ code: 'INTERNAL_ERROR', message: '暂时无法读取。', requestId: 'r-9' }, 500),
    );
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  expect(await screen.findByText('读到的观点：慢就是快。')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));

  expect(await screen.findByText('暂时无法读取。')).toBeVisible();
  expect(screen.getByText('读到的观点：慢就是快。')).toBeVisible();
  expect(screen.queryByRole('button', { name: '加载更多' })).not.toBeInTheDocument();
}

/** 用于打开某条记录的删除确认对话框。 */
async function openDeleteDialog(content: string): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: `删除记录“${content}”` }));
  const dialog = await screen.findByRole('alertdialog', { name: '删除这条记录' });
  expect(dialog).toBeVisible();
  return dialog;
}

/** 用于验证删除确认成功后才从列表移除。 */
async function removesItemAfterConfirmedDelete(): Promise<void> {
  const item = summary();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [item], nextCursor: null }))
    .mockResolvedValueOnce(jsonResponse(undefined, 204));
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  expect(await screen.findByText('读到的观点：慢就是快。')).toBeVisible();
  const dialog = await openDeleteDialog('读到的观点：慢就是快。');
  expect(within(dialog).getByText(/删除后无法在当前版本恢复/)).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: '确认删除' }));

  await waitFor(() => expect(screen.queryByText('读到的观点：慢就是快。')).not.toBeInTheDocument());
  const request = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
  expect(request?.method).toBe('DELETE');
}

/** 用于验证删除失败保留记录并显示原因。 */
async function keepsItemWhenDeleteFails(): Promise<void> {
  const item = summary();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [item], nextCursor: null }))
    .mockResolvedValueOnce(
      jsonResponse({ code: 'INTERNAL_ERROR', message: '服务暂不可用。', requestId: 'r2' }, 500),
    );
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  expect(await screen.findByText('读到的观点：慢就是快。')).toBeVisible();
  const dialog = await openDeleteDialog('读到的观点：慢就是快。');
  fireEvent.click(within(dialog).getByRole('button', { name: '确认删除' }));

  expect(await within(dialog).findByText('服务暂不可用。')).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  expect(await screen.findByText('读到的观点：慢就是快。')).toBeVisible();
}

/** 用于验证删除结果不确定时重读服务端且不隐藏失败记录。 */
async function resyncsAndReopensWhenDeleteOutcomeUnknown(): Promise<void> {
  const item = summary();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [item], nextCursor: null }))
    .mockRejectedValueOnce(new Error('connection closed'))
    .mockResolvedValueOnce(jsonResponse({ items: [item], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  expect(await screen.findByText('读到的观点：慢就是快。')).toBeVisible();
  const dialog = await openDeleteDialog('读到的观点：慢就是快。');
  fireEvent.click(within(dialog).getByRole('button', { name: '确认删除' }));

  const reopened = await screen.findByRole('alertdialog', { name: '删除这条记录' });
  expect(
    await within(reopened).findByText('删除结果尚未确认，请重试或重新读取列表。'),
  ).toBeVisible();
  expect(screen.getByText('读到的观点：慢就是快。')).toBeVisible();
  expect(fetchMock).toHaveBeenCalledTimes(3);
}

/** 用于验证移动端阅读不提供记录与删除控件。 */
async function omitsProcessingControlsOnMobile(): Promise<void> {
  const item = summary();
  const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ items: [item], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock);
  renderMobile();

  expect(await screen.findByText('读到的观点：慢就是快。')).toBeVisible();
  expect(screen.getByText(NOTICE)).toBeVisible();
  expect(screen.queryByRole('textbox', { name: '内容' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '记录' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /删除记录/ })).not.toBeInTheDocument();
  cleanup();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ items: [], nextCursor: null })));
  renderMobile();

  expect(await screen.findByText('Inbox 还是空的')).toBeVisible();
  expect(screen.queryByRole('button', { name: '写下第一条记录' })).not.toBeInTheDocument();
}

test('records text from an empty inbox', recordsTextFromEmptyInbox);
test('records a single-line url as a link', recordsSingleLineUrlAsLink);
test('records a trailing-newline url as a link', recordsTrailingNewlineUrlAsLink);
test('rejects a broken url with a field error', rejectsBrokenUrlWithFieldError);
test('treats a multi-line url note as text', treatsMultiLineUrlNoteAsText);
test('keeps input after a failed submit', keepsInputAfterFailedSubmit);
test('resyncs the list after an unknown create outcome', resyncsListAfterUnknownCreateOutcome);
test('loads the next page with the opaque cursor', loadsNextPageWithCursor);
test('retains loaded items after a pagination failure', retainsItemsAfterPaginationFailure);
test('removes the item only after a confirmed delete', removesItemAfterConfirmedDelete);
test('keeps the item when delete fails', keepsItemWhenDeleteFails);
test(
  'resyncs and reopens when the delete outcome is unknown',
  resyncsAndReopensWhenDeleteOutcomeUnknown,
);
test('omits processing controls on mobile reading', omitsProcessingControlsOnMobile);
