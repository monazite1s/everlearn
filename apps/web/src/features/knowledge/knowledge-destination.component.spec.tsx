/** @fileoverview 验证真实概览管理、冲突、删除和不可访问状态。 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { KnowledgeBaseSummary } from '@everlearn/contracts';
import { EverlearnUiProvider } from '@everlearn/ui';
import { afterEach, expect, test, vi } from 'vitest';

import { KnowledgeDestination } from './knowledge-destination';

const routerPush = vi.fn();

/** 用于返回删除后所需的最小路由接口。 */
function useMockRouter() {
  return { push: routerPush };
}

/** 用于只提供概览功能使用的 App Router 接口。 */
function createNavigationMock() {
  return { useRouter: useMockRouter };
}

vi.mock('next/navigation', createNavigationMock);

/** 用于构造概览场景所需的严格服务端摘要。 */
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

/** 用于返回 API 适配器所需的最小 Fetch 响应。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于返回确定响应载荷。 */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** 用于为响应式能力测试返回确定视口查询结果。 */
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

/** 用于在生产 UI Provider 中渲染概览页面。 */
function renderDestination(id = summary().id, desktop = true): ReturnType<typeof render> {
  vi.stubGlobal('matchMedia', matchViewport(desktop));
  return render(
    <EverlearnUiProvider colorMode="light">
      <KnowledgeDestination knowledgeBaseId={id} />
    </EverlearnUiProvider>,
  );
}

/** 用于在每个场景后恢复请求、路由和 DOM 状态。 */
function resetScenario(): void {
  cleanup();
  routerPush.mockReset();
  vi.unstubAllGlobals();
}

afterEach(resetScenario);

/** 用于验证按观察版本保存裁剪元数据并渲染确认事实。 */
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
  expect(await screen.findByText('新说明')).toBeVisible();
  const request = fetchMock.mock.calls[1]?.[1] as RequestInit;
  expect(request.method).toBe('PATCH');
  expect(request.body).toBe(JSON.stringify({ description: '新说明', name: '新名称', version: 1 }));
}

/** 用于验证版本冲突后保留编辑值并展示可操作指引。 */
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

/** 用于验证失败编辑保持可见直到取消清除草稿和错误。 */
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

/** 用于验证危险操作需要确认且成功后返回列表。 */
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

/** 用于验证未知删除结果保持可见并安全重试相同版本。 */
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

/** 用于验证删除版本冲突留在页面并展示可操作指引。 */
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

/** 用于验证稳定 404 隐藏元数据且不提供重试。 */
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

/** 用于验证动态路由标识变化时立即移除旧资源操作。 */
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

/** 用于验证移动阅读视口不提供桌面管理能力。 */
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
