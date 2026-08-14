/** @fileoverview Verifies real overview management, conflicts, deletion, and inaccessible states. */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { KnowledgeBaseSummary } from '@everlearn/contracts';
import { EverlearnUiProvider } from '@everlearn/ui';
import { afterEach, expect, test, vi } from 'vitest';

import { KnowledgeDestination } from './knowledge-destination';

const routerPush = vi.fn();

/** Returns the narrow router surface consumed after deletion. */
function useMockRouter() {
  return { push: routerPush };
}

/** Provides only the App Router function used by the destination feature. */
function createNavigationMock() {
  return { useRouter: useMockRouter };
}

vi.mock('next/navigation', createNavigationMock);

/** Builds one exact server summary for overview scenarios. */
function summary(overrides: Partial<KnowledgeBaseSummary> = {}): KnowledgeBaseSummary {
  return {
    description: '长期学习说明。',
    documentCount: 3,
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'normal',
    name: 'Agent 工程',
    updatedAt: '2026-08-14T08:00:00.000000Z',
    version: 1,
    ...overrides,
  };
}

/** Returns the minimal fetch response consumed by the API adapter. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** Resolves one deterministic payload. */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** Returns a deterministic viewport query result for responsive capability tests. */
function matchViewport(matches: boolean): (query: string) => MediaQueryList {
  return (query) =>
    ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }) as MediaQueryList;
}

/** Renders the destination inside the production UI provider. */
function renderDestination(id = summary().id, desktop = true): ReturnType<typeof render> {
  vi.stubGlobal('matchMedia', matchViewport(desktop));
  return render(
    <EverlearnUiProvider colorMode="light">
      <KnowledgeDestination knowledgeBaseId={id} />
    </EverlearnUiProvider>,
  );
}

/** Restores request, router, and DOM state after each scenario. */
function resetScenario(): void {
  cleanup();
  routerPush.mockReset();
  vi.unstubAllGlobals();
}

afterEach(resetScenario);

/** Saves trimmed metadata with the observed version and renders confirmed facts. */
async function updatesMetadata(): Promise<void> {
  const initial = summary();
  const updated = summary({ description: '新说明', name: '新名称', version: 2 });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(initial))
    .mockResolvedValueOnce(jsonResponse(updated));
  vi.stubGlobal('fetch', fetchMock);
  renderDestination();
  await screen.findByRole('heading', { level: 1, name: initial.name });

  fireEvent.click(await screen.findByRole('button', { name: '知识库操作' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '编辑名称与说明' }));
  const dialog = await screen.findByRole('dialog', { name: '编辑知识库' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: '名称' }), {
    target: { value: '  新名称  ' },
  });
  fireEvent.change(within(dialog).getByRole('textbox', { name: '说明' }), {
    target: { value: '  新说明  ' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '保存修改' }));

  expect(await screen.findByRole('heading', { level: 1, name: '新名称' })).toBeVisible();
  expect(
    within(screen.getByRole('main', { name: '知识库内容' })).getByText('新说明'),
  ).toBeVisible();
  const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
  expect(request.method).toBe('PATCH');
  expect(request.body).toBe(JSON.stringify({ description: '新说明', name: '新名称', version: 1 }));
}

/** Preserves edited values and shows actionable guidance after a version conflict. */
async function retainsInputAfterConflict(): Promise<void> {
  const latest = summary({ description: '服务端新说明', version: 2 });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(summary()))
    .mockResolvedValueOnce(
      jsonResponse(
        { code: 'VERSION_CONFLICT', message: '资源已更新。', requestId: 'request-1' },
        409,
      ),
    )
    .mockResolvedValueOnce(jsonResponse(latest));
  vi.stubGlobal('fetch', fetchMock);
  renderDestination();
  await screen.findByRole('heading', { level: 1, name: 'Agent 工程' });
  fireEvent.click(await screen.findByRole('button', { name: '知识库操作' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '编辑名称与说明' }));
  const dialog = await screen.findByRole('dialog', { name: '编辑知识库' });
  const input = within(dialog).getByRole('textbox', { name: '名称' });
  fireEvent.change(input, { target: { value: '未保存的新名称' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '保存修改' }));

  expect(await screen.findByText(/存在新版本/)).toBeVisible();
  expect(input).toHaveValue('未保存的新名称');
  fireEvent.click(screen.getByRole('button', { name: '读取最新版本' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(input).toHaveValue('未保存的新名称');
  expect(screen.queryByText(/存在新版本/)).not.toBeInTheDocument();
}

/** Keeps failed edits visible until cancellation removes draft and error state. */
async function preservesFailureUntilCancelled(): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(summary()))
      .mockResolvedValueOnce(
        jsonResponse({ code: 'INTERNAL_ERROR', message: '暂时无法保存。', requestId: 'r-3' }, 500),
      ),
  );
  renderDestination();
  await screen.findByRole('heading', { level: 1, name: 'Agent 工程' });
  fireEvent.click(await screen.findByRole('button', { name: '知识库操作' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '编辑名称与说明' }));
  const dialog = await screen.findByRole('dialog', { name: '编辑知识库' });
  const input = within(dialog).getByRole('textbox', { name: '名称' });
  fireEvent.change(input, { target: { value: '失败但保留' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '保存修改' }));
  expect(await within(dialog).findByText('暂时无法保存。')).toBeVisible();
  expect(input).toHaveValue('失败但保留');
  fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.queryByDisplayValue('失败但保留')).not.toBeInTheDocument();
  expect(screen.queryByText('暂时无法保存。')).not.toBeInTheDocument();
}

/** Requires destructive confirmation and returns to the list after a confirmed 204. */
async function deletesAfterConfirmation(): Promise<void> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(summary()))
    .mockResolvedValueOnce(jsonResponse(undefined, 204));
  vi.stubGlobal('fetch', fetchMock);
  renderDestination();
  await screen.findByRole('heading', { level: 1, name: 'Agent 工程' });
  fireEvent.click(await screen.findByRole('button', { name: '知识库操作' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '移入回收站' }));
  const dialog = await screen.findByRole('dialog', { name: '移入回收站' });
  expect(within(dialog).getByText(/3 篇文档/)).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: '确认移入回收站' }));

  await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/knowledge'));
  const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
  expect(request.method).toBe('DELETE');
  expect(request.body).toBe(JSON.stringify({ version: 1 }));
}

/** Keeps an unknown delete visible and safely retries the exact version request. */
async function retriesUnknownDelete(): Promise<void> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(summary()))
    .mockRejectedValueOnce(new TypeError('network unavailable'))
    .mockResolvedValueOnce(jsonResponse(undefined, 204));
  vi.stubGlobal('fetch', fetchMock);
  renderDestination();
  await screen.findByRole('heading', { level: 1, name: 'Agent 工程' });
  fireEvent.click(screen.getByRole('button', { name: '知识库操作' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '移入回收站' }));
  const dialog = await screen.findByRole('dialog', { name: '移入回收站' });
  const confirm = within(dialog).getByRole('button', { name: '确认移入回收站' });
  fireEvent.click(confirm);
  expect(await within(dialog).findByText(/可以安全重试/)).toBeVisible();
  expect(routerPush).not.toHaveBeenCalled();
  fireEvent.click(confirm);
  await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/knowledge'));
  const firstRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
  const secondRequest = fetchMock.mock.calls[2]?.[1] as RequestInit;
  expect(firstRequest.body).toBe(secondRequest.body);
}

/** Keeps a version-conflicted deletion on the page with actionable guidance. */
async function keepsDeleteConflictVisible(): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(summary()))
      .mockResolvedValueOnce(
        jsonResponse({ code: 'VERSION_CONFLICT', message: '版本冲突。', requestId: 'r-4' }, 409),
      ),
  );
  renderDestination();
  await screen.findByRole('heading', { level: 1, name: 'Agent 工程' });
  fireEvent.click(await screen.findByRole('button', { name: '知识库操作' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: '移入回收站' }));
  const dialog = await screen.findByRole('dialog', { name: '移入回收站' });
  fireEvent.click(within(dialog).getByRole('button', { name: '确认移入回收站' }));
  expect(await within(dialog).findByText(/知识库已发生变化/)).toBeVisible();
  expect(routerPush).not.toHaveBeenCalled();
}

/** Hides inaccessible metadata and omits retry behavior for stable 404 responses. */
async function rendersInaccessibleState(): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { code: 'NOT_FOUND', message: '请求的资源不存在或不可访问。', requestId: 'request-2' },
          404,
        ),
      ),
  );
  renderDestination('22222222-2222-4222-8222-222222222222');

  expect(await screen.findByText('知识库不可访问')).toBeVisible();
  expect(screen.getByRole('heading', { level: 1, name: '无法打开知识库' })).toBeVisible();
  expect(screen.queryByRole('button', { name: '重新读取' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '知识库操作' })).not.toBeInTheDocument();
}

/** Removes the prior resource actions immediately when a dynamic route ID changes. */
async function isolatesDynamicRouteChanges(): Promise<void> {
  const nextId = '22222222-2222-4222-8222-222222222222';
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse(summary()))
    .mockImplementationOnce(() => new Promise<Response>(() => undefined));
  vi.stubGlobal('fetch', fetchMock);
  const view = renderDestination();
  await screen.findByRole('heading', { level: 1, name: 'Agent 工程' });
  await screen.findByRole('button', { name: '知识库操作' });
  view.rerender(
    <EverlearnUiProvider colorMode="light">
      <KnowledgeDestination knowledgeBaseId={nextId} />
    </EverlearnUiProvider>,
  );
  expect(screen.queryByRole('heading', { level: 1, name: 'Agent 工程' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '知识库操作' })).not.toBeInTheDocument();
  expect(screen.getByLabelText('正在加载知识库')).toBeVisible();
}

/** Omits desktop management capability from a mobile reading viewport. */
async function omitsMobileManagement(): Promise<void> {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(summary())));
  renderDestination(summary().id, false);
  await screen.findByRole('heading', { level: 1, name: 'Agent 工程' });
  expect(screen.queryByRole('button', { name: '知识库操作' })).not.toBeInTheDocument();
}

test('updates metadata from the persisted overview', updatesMetadata);
test('retains edit input after a version conflict', retainsInputAfterConflict);
test('preserves failed input until cancellation removes it', preservesFailureUntilCancelled);
test('deletes only after confirmation and returns to the list', deletesAfterConfirmation);
test('retries an unknown deletion with the exact request', retriesUnknownDelete);
test('keeps a version-conflicted deletion visible', keepsDeleteConflictVisible);
test('renders inaccessible knowledge bases without metadata', rendersInaccessibleState);
test('isolates actions when the dynamic route ID changes', isolatesDynamicRouteChanges);
test('omits desktop management from mobile reading', omitsMobileManagement);
