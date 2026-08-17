/** @fileoverview 验证文档创建与重命名对话框的失败恢复与版本冲突。 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DocumentTreeItem } from '@everlearn/contracts';
import { afterEach, expect, test, vi } from 'vitest';

import { DocumentTree } from './document-tree';

const KNOWLEDGE_BASE_ID = '11111111-1111-4111-8111-111111111111';
const onCreated = vi.fn();

interface ServerDocument {
  childCount: number;
  id: string;
  parentId: string | null;
  title: string;
  version: number;
}

/** 用于返回对话框场景所需的最小 Fetch 响应。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于返回确定响应载荷。 */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** 用于把 Fetch 输入收敛为可解析的 URL 对象。 */
function toUrl(input: RequestInfo | URL): URL {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return new URL(raw, 'http://localhost');
}

/** 用于读取一次请求调用解析后的 URL。 */
function callUrl(call: readonly unknown[] | undefined): URL | undefined {
  const input = call?.[0];
  return input === undefined ? undefined : toUrl(input as RequestInfo | URL);
}

/** 用于读取一次请求调用的初始化对象。 */
function callInit(call: readonly [unknown, (RequestInit | undefined)?] | undefined): RequestInit {
  return call?.[1] ?? {};
}

/** 用于返回一个文档的公开树节点投影。 */
function itemOf(document: ServerDocument): DocumentTreeItem {
  return {
    childCount: document.childCount,
    id: document.id,
    title: document.title,
    updatedAt: '2026-08-17T08:00:00.000000Z',
    version: document.version,
  };
}

/** 用于返回一个文档的公开详情投影。 */
function toDetail(document: ServerDocument): Record<string, unknown> {
  return { ...itemOf(document), knowledgeBaseId: KNOWLEDGE_BASE_ID, parentId: document.parentId };
}

/** 用于把请求体安全解析为创建输入。 */
function parseCreateBody(init: RequestInit | undefined): { parentId?: string; title: string } {
  if (typeof init?.body !== 'string') return { title: '' };
  return JSON.parse(init.body) as { parentId?: string; title: string };
}

/** 用于把请求体安全解析为重命名输入。 */
function parseRenameBody(init: RequestInit | undefined): { title: string; version: number } {
  if (typeof init?.body !== 'string') return { title: '', version: -1 };
  return JSON.parse(init.body) as { title: string; version: number };
}

/** 用于构造支持读取、创建、重命名与冲突的内存文档服务。 */
function createDocumentServer(initial: readonly ServerDocument[]) {
  const documents = initial.map((document) => ({ ...document }));
  /** 用于按提交版本重命名或返回版本冲突。 */
  function renameResponse(document: ServerDocument, body: { title: string; version: number }) {
    if (document.version !== body.version) {
      return jsonResponse(
        { code: 'VERSION_CONFLICT', message: '文档已更新。', requestId: 'request-1' },
        409,
      );
    }
    document.title = body.title;
    document.version += 1;
    return jsonResponse(toDetail(document));
  }
  /** 用于按方法和路径响应文档读写请求。 */
  function route(input: RequestInfo | URL, init?: RequestInit): Response {
    const url = toUrl(input);
    const method = init?.method ?? 'GET';
    if (url.pathname.endsWith('/documents')) {
      if (method === 'GET') {
        const parentId = url.searchParams.get('parentId');
        const items = documents.filter((document) => document.parentId === parentId).map(itemOf);
        return jsonResponse({ items, nextCursor: null });
      }
      if (method === 'POST') {
        const body = parseCreateBody(init);
        const created: ServerDocument = {
          childCount: 0,
          id: `doc-${documents.length + 1}`,
          parentId: body.parentId ?? null,
          title: body.title,
          version: 1,
        };
        documents.push(created);
        return jsonResponse(toDetail(created), 201);
      }
    }
    const id = url.pathname.split('/').at(-1);
    const document = documents.find((candidate) => candidate.id === id);
    if (!document) {
      return jsonResponse({ code: 'NOT_FOUND', message: '请求的资源不存在或不可访问。' }, 404);
    }
    if (method === 'PATCH') return renameResponse(document, parseRenameBody(init));
    return jsonResponse(toDetail(document));
  }
  return { documents, fetchMock: vi.fn(route) };
}

/** 用于在生产组件中渲染文档树。 */
function renderTree(): void {
  render(
    <DocumentTree
      desktop
      knowledgeBaseId={KNOWLEDGE_BASE_ID}
      offline={false}
      onCreated={onCreated}
    />,
  );
}

/** 用于通过行菜单触发指定文档操作。 */
async function chooseRowAction(title: string, action: string): Promise<void> {
  fireEvent.pointerDown(screen.getByRole('button', { name: `“${title}”的文档操作` }));
  fireEvent.click(await screen.findByRole('menuitem', { name: action }));
}

/** 用于等待行标题在树中完成同步。 */
async function findRowTitle(title: string): Promise<HTMLElement> {
  return screen.findByTitle(title);
}

/** 用于在每个场景后恢复请求与 DOM 状态。 */
function resetScenario(): void {
  cleanup();
  onCreated.mockReset();
  vi.unstubAllGlobals();
}

afterEach(resetScenario);

/** 用于验证按最后观察版本重命名并更新树行。 */
async function renamesWithObservedVersion(): Promise<void> {
  const server = createDocumentServer([
    { childCount: 0, id: 'doc-1', parentId: null, title: '原始标题', version: 3 },
  ]);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  expect(await screen.findByTitle('原始标题')).toBeVisible();
  await chooseRowAction('原始标题', '重命名');
  const dialog = await screen.findByRole('dialog', { name: '重命名文档' });
  const input = within(dialog).getByRole('textbox', { name: '标题' });
  fireEvent.change(input, { target: { value: '  新标题  ' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '保存修改' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(await findRowTitle('新标题')).toBeVisible();
  const request = callInit(server.fetchMock.mock.calls[1]);
  expect(request.method).toBe('PATCH');
  expect(request.body).toBe(JSON.stringify({ title: '新标题', version: 3 }));
}

/** 用于验证创建失败保留输入与失败原因。 */
async function keepsInputWhenCreateFails(): Promise<void> {
  const server = createDocumentServer([]);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  await screen.findByText('还没有文档');
  server.fetchMock.mockImplementationOnce(() =>
    jsonResponse({ code: 'INTERNAL_ERROR', message: '暂时无法创建。', requestId: 'r-9' }, 500),
  );
  fireEvent.click(screen.getByRole('button', { name: '新建首篇文档' }));
  const dialog = await screen.findByRole('dialog', { name: '新建文档' });
  const input = within(dialog).getByRole('textbox', { name: '标题' });
  fireEvent.change(input, { target: { value: '待重试标题' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '创建文档' }));
  expect(await within(dialog).findByText('暂时无法创建。')).toBeVisible();
  expect(input).toHaveValue('待重试标题');
  expect(onCreated).not.toHaveBeenCalled();
}

/** 用于验证重命名失败保留输入与失败原因。 */
async function keepsInputWhenRenameFails(): Promise<void> {
  const server = createDocumentServer([
    { childCount: 0, id: 'doc-1', parentId: null, title: '稳定标题', version: 1 },
  ]);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  expect(await screen.findByTitle('稳定标题')).toBeVisible();
  server.fetchMock.mockImplementationOnce(() =>
    jsonResponse({ code: 'INTERNAL_ERROR', message: '暂时无法保存。', requestId: 'r-8' }, 500),
  );
  await chooseRowAction('稳定标题', '重命名');
  const dialog = await screen.findByRole('dialog', { name: '重命名文档' });
  const input = within(dialog).getByRole('textbox', { name: '标题' });
  fireEvent.change(input, { target: { value: '失败但保留' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '保存修改' }));
  expect(await within(dialog).findByText('暂时无法保存。')).toBeVisible();
  expect(input).toHaveValue('失败但保留');
  expect(screen.getByTitle('稳定标题')).toBeVisible();
}

/** 用于验证版本冲突保留输入并可读取最新版本后重存。 */
async function resolvesRenameConflictByReloadingLatest(): Promise<void> {
  const server = createDocumentServer([
    { childCount: 0, id: 'doc-1', parentId: null, title: '本地标题', version: 1 },
  ]);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  expect(await screen.findByTitle('本地标题')).toBeVisible();
  await chooseRowAction('本地标题', '重命名');
  const dialog = await screen.findByRole('dialog', { name: '重命名文档' });
  const input = within(dialog).getByRole('textbox', { name: '标题' });
  fireEvent.change(input, { target: { value: '未保存的新标题' } });
  const concurrent = server.documents[0];
  if (concurrent) {
    concurrent.title = '服务端标题';
    concurrent.version = 2;
  }
  fireEvent.click(within(dialog).getByRole('button', { name: '保存修改' }));
  expect(await within(dialog).findByText(/你的输入已保留/)).toBeVisible();
  expect(input).toHaveValue('未保存的新标题');
  fireEvent.click(screen.getByRole('button', { name: '读取最新版本' }));
  await waitFor(() => expect(screen.queryByText(/你的输入已保留/)).not.toBeInTheDocument());
  expect(await findRowTitle('服务端标题')).toBeVisible();
  expect(input).toHaveValue('未保存的新标题');
  fireEvent.click(within(dialog).getByRole('button', { name: '保存修改' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(await findRowTitle('未保存的新标题')).toBeVisible();
  const resave = callInit(server.fetchMock.mock.calls.at(-1));
  expect(resave.body).toBe(JSON.stringify({ title: '未保存的新标题', version: 2 }));
}

/** 用于验证未知创建结果触发列表重读以恢复一致。 */
async function reconcilesAfterUncertainCreate(): Promise<void> {
  const server = createDocumentServer([]);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  await screen.findByText('还没有文档');
  server.fetchMock.mockRejectedValueOnce(new TypeError('network unavailable'));
  fireEvent.click(screen.getByRole('button', { name: '新建首篇文档' }));
  const dialog = await screen.findByRole('dialog', { name: '新建文档' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: '标题' }), {
    target: { value: '未确认标题' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '创建文档' }));
  expect(await within(dialog).findByText(/无法连接文档服务/)).toBeVisible();
  await waitFor(() => expect(server.fetchMock).toHaveBeenCalledTimes(3));
  const reconcile = server.fetchMock.mock.calls[2];
  expect(callUrl(reconcile)?.pathname).toContain('/documents');
  expect(reconcile?.[1]?.method ?? 'GET').toBe('GET');
}

test('renames with the observed version', renamesWithObservedVersion);
test('keeps input when creation fails', keepsInputWhenCreateFails);
test('keeps input when renaming fails', keepsInputWhenRenameFails);
test(
  'resolves a rename conflict by reloading the latest version',
  resolvesRenameConflictByReloadingLatest,
);
test('reconciles the list after an uncertain creation result', reconcilesAfterUncertainCreate);
