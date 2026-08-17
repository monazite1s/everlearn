/** @fileoverview 验证 Inbox 记录转换对话框的目标选择、幂等提交与结果收尾。 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { InboxItemSummary } from '@everlearn/contracts';
import { afterEach, expect, test, vi } from 'vitest';

import { InboxPage } from './inbox-page';

const routerPush = vi.fn();
const NOTICE = '移动端保留阅读、搜索和运行状态，暂不提供内容创作。';

vi.mock('next/navigation', () => ({
  /** 用于提供转换成功后跳转所需的最小路由接口。 */
  useRouter: () => ({ push: routerPush }),
}));

/** 用于构造转换场景的待处理记录。 */
function record(): InboxItemSummary {
  return {
    content: '一条待整理的记录',
    createdAt: '2026-08-18T08:00:00.000000Z',
    id: '22222222-2222-4222-8222-222222222222',
    kind: 'text',
  };
}

/** 用于返回页面适配器所需的最小 Fetch 响应。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于返回确定响应载荷。 */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** 用于构造目标知识库列表第一页响应。 */
function basesPage(): unknown {
  return {
    items: [
      {
        description: '',
        documentCount: 1,
        id: '11111111-1111-4111-8111-111111111111',
        kind: 'normal',
        name: 'Agent 工程',
        updatedAt: '2026-08-18T08:00:00.000000Z',
        version: 1,
      },
    ],
    nextCursor: null,
  };
}

/** 用于构造目标知识库根级文档响应。 */
function rootsPage(): unknown {
  return {
    items: [
      {
        childCount: 0,
        id: '33333333-3333-4333-8333-333333333333',
        title: '已有根文档',
        updatedAt: '2026-08-18T08:00:00.000000Z',
        version: 1,
      },
    ],
    nextCursor: null,
  };
}

/** 用于构造转换端点确认的严格详情。 */
function convertedDetail(): unknown {
  return {
    childCount: 0,
    id: '44444444-4444-4444-8444-444444444444',
    knowledgeBaseId: '11111111-1111-4111-8111-111111111111',
    parentId: null,
    title: '一条待整理的记录',
    updatedAt: '2026-08-18T08:00:00.000000Z',
    version: 1,
  };
}

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

/** 用于按 URL 前缀与次数返回记录、目标与转换的完整请求序列。 */
function stubFullFlow(extra: readonly { body: unknown; status: number }[]): {
  fetchMock: ReturnType<typeof vi.fn>;
} {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [record()], nextCursor: null }))
    .mockResolvedValueOnce(jsonResponse(basesPage()))
    .mockResolvedValueOnce(jsonResponse(rootsPage()));
  for (const stage of extra)
    fetchMock.mockResolvedValueOnce(jsonResponse(stage.body, stage.status));
  fetchMock.mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock };
}

/** 用于打开转换对话框并完成知识库与父级选择。 */
async function openDialogWithSelection(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: '转换为文档“一条待整理的记录”' }));
  const dialog = await screen.findByRole('dialog', { name: '转换为文档' });
  await chooseOption(within(dialog).getByRole('combobox', { name: '目标知识库' }), 'Agent 工程');
  await chooseOption(within(dialog).getByRole('combobox', { name: '父级文档' }), '已有根文档');
}

/** 用于打开一个 Select 并点选匹配选项。 */
async function chooseOption(trigger: HTMLElement, name: string | RegExp): Promise<void> {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  const option = await screen.findByRole('option', { name });
  fireEvent.pointerUp(option, { pointerType: 'mouse' });
  fireEvent.click(option);
}

/** 用于渲染桌面 Inbox 页面。 */
function renderDesktop(): void {
  stubViewport(true);
  render(<InboxPage mobileNotice={NOTICE} />);
}

/** 用于读取第 index 次调用中转换请求的幂等键头。 */
function convertKeyOf(fetchMock: ReturnType<typeof vi.fn>, index: number): string {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.['Idempotency-Key'] ?? '';
}

afterEach(() => {
  cleanup();
  routerPush.mockReset();
  stubViewport(false);
  vi.unstubAllGlobals();
});

/** 用于验证默认标题、目标选择、载荷与成功导航。 */
async function convertsSelectionAndNavigates(): Promise<void> {
  const { fetchMock } = stubFullFlow([{ body: convertedDetail(), status: 201 }]);
  renderDesktop();
  await screen.findByText('一条待整理的记录');
  await openDialogWithSelection();
  const dialog = screen.getByRole('dialog', { name: '转换为文档' });
  expect(within(dialog).getByRole('textbox', { name: '标题' })).toHaveValue('一条待整理的记录');
  fireEvent.click(within(dialog).getByRole('button', { name: '转换并进入' }));

  await waitFor(() =>
    expect(routerPush).toHaveBeenCalledWith('/knowledge/11111111-1111-4111-8111-111111111111'),
  );
  const request = fetchMock.mock.calls[3]?.[1] as RequestInit;
  expect(request.method).toBe('POST');
  expect(request.body).toBe(
    JSON.stringify({
      knowledgeBaseId: '11111111-1111-4111-8111-111111111111',
      parentId: '33333333-3333-4333-8333-333333333333',
      title: '一条待整理的记录',
    }),
  );
}

/** 用于验证已知失败保留选择与标题输入。 */
async function keepsSelectionAfterFailure(): Promise<void> {
  stubFullFlow([
    { body: { code: 'INTERNAL_ERROR', message: '暂时无法转换。', requestId: 'r-1' }, status: 500 },
    { body: convertedDetail(), status: 201 },
  ]);
  renderDesktop();
  await screen.findByText('一条待整理的记录');
  await openDialogWithSelection();
  const dialog = screen.getByRole('dialog', { name: '转换为文档' });
  fireEvent.click(within(dialog).getByRole('button', { name: '转换并进入' }));

  expect(await within(dialog).findByText('暂时无法转换。')).toBeVisible();
  expect(within(dialog).getByRole('combobox', { name: '目标知识库' })).toHaveTextContent(
    'Agent 工程',
  );
  expect(within(dialog).getByRole('textbox', { name: '标题' })).toHaveValue('一条待整理的记录');
}

/** 用于验证网络不确定失败后重试复用同一幂等键。 */
async function reusesKeyOnUnknownOutcomeRetry(): Promise<void> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [record()], nextCursor: null }))
    .mockResolvedValueOnce(jsonResponse(basesPage()))
    .mockResolvedValueOnce(jsonResponse(rootsPage()))
    .mockRejectedValueOnce(new TypeError('network unavailable'))
    .mockResolvedValueOnce(jsonResponse(convertedDetail(), 201))
    .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();
  await screen.findByText('一条待整理的记录');
  await openDialogWithSelection();
  const dialog = screen.getByRole('dialog', { name: '转换为文档' });
  fireEvent.click(within(dialog).getByRole('button', { name: '转换并进入' }));
  expect(await within(dialog).findByText(/无法连接/)).toBeVisible();
  const firstKey = convertKeyOf(fetchMock, 3);

  fireEvent.click(within(dialog).getByRole('button', { name: '转换并进入' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
  expect(convertKeyOf(fetchMock, 4)).toBe(firstKey);
}

/** 用于验证幂等键冲突后的再次提交换用新键。 */
async function issuesNewKeyAfterConflict(): Promise<void> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [record()], nextCursor: null }))
    .mockResolvedValueOnce(jsonResponse(basesPage()))
    .mockResolvedValueOnce(jsonResponse(rootsPage()))
    .mockResolvedValueOnce(
      jsonResponse(
        { code: 'IDEMPOTENCY_CONFLICT', message: '重复请求不一致。', requestId: 'r-2' },
        409,
      ),
    )
    .mockResolvedValueOnce(jsonResponse(convertedDetail(), 201))
    .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();
  await screen.findByText('一条待整理的记录');
  await openDialogWithSelection();
  const dialog = screen.getByRole('dialog', { name: '转换为文档' });
  fireEvent.click(within(dialog).getByRole('button', { name: '转换并进入' }));
  expect(await within(dialog).findByText(/重复请求不一致/)).toBeVisible();
  const firstKey = convertKeyOf(fetchMock, 3);

  fireEvent.click(within(dialog).getByRole('button', { name: '转换并进入' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(6));
  expect(convertKeyOf(fetchMock, 4)).not.toBe(firstKey);
}

/** 用于验证记录已转换或目标失效时重读事实并关闭对话框。 */
async function resyncsAndClosesOnNotFound(): Promise<void> {
  const { fetchMock } = stubFullFlow([
    {
      body: { code: 'NOT_FOUND', message: '请求的资源不存在或不可访问。', requestId: 'r-3' },
      status: 404,
    },
  ]);
  renderDesktop();
  await screen.findByText('一条待整理的记录');
  await openDialogWithSelection();
  fireEvent.click(screen.getByRole('button', { name: '转换并进入' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await screen.findByText('Inbox 还是空的');
  expect(String(fetchMock.mock.calls[4]?.[0])).toContain('/inbox-items');
}

/** 用于验证移动端不渲染转换入口。 */
async function omitsConvertControlsOnMobile(): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse({ items: [record()], nextCursor: null })),
  );
  stubViewport(false);
  render(<InboxPage mobileNotice={NOTICE} />);
  await screen.findByText('一条待整理的记录');
  expect(
    screen.queryByRole('button', { name: '转换为文档“一条待整理的记录”' }),
  ).not.toBeInTheDocument();
}

/** 用于验证目标知识库加载失败时给出可行动提示。 */
async function showsKnowledgeBaseLoadFailure(): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [record()], nextCursor: null }))
      .mockResolvedValueOnce(
        jsonResponse(
          { code: 'INTERNAL_ERROR', message: '知识库列表未加载。', requestId: 'r-4' },
          500,
        ),
      ),
  );
  renderDesktop();
  await screen.findByText('一条待整理的记录');
  fireEvent.click(screen.getByRole('button', { name: '转换为文档“一条待整理的记录”' }));

  const dialog = await screen.findByRole('dialog', { name: '转换为文档' });
  expect(await within(dialog).findByText('知识库列表未加载。')).toBeVisible();
}

test('converts the selection and navigates to the target', convertsSelectionAndNavigates);
test('keeps selection and title after a known failure', keepsSelectionAfterFailure);
test('reuses the idempotency key when retrying an unknown outcome', reusesKeyOnUnknownOutcomeRetry);
test('issues a fresh key after an idempotency conflict', issuesNewKeyAfterConflict);
test('resyncs and closes the dialog when the record is gone', resyncsAndClosesOnNotFound);
test('omits convert controls on mobile reading', omitsConvertControlsOnMobile);
test('shows a knowledge-base load failure', showsKnowledgeBaseLoadFailure);
