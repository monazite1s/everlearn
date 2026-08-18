/** @fileoverview 验证文档树的按需加载、展开恢复与移动端只读行为。 */

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

/** 用于返回树组件所需的最小 Fetch 响应。 */
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

/** 用于在内存文档服务中追加创建的文档并维护父级计数。 */
function appendDocument(
  documents: ServerDocument[],
  body: { parentId?: string; title: string },
): ServerDocument {
  const created: ServerDocument = {
    childCount: 0,
    id: `doc-${documents.length + 1}`,
    parentId: body.parentId ?? null,
    title: body.title,
    version: 1,
  };
  documents.push(created);
  const parent = documents.find((document) => document.id === created.parentId);
  if (parent) parent.childCount += 1;
  return created;
}

/** 用于把请求体安全解析为创建输入。 */
function parseCreateBody(init: RequestInit | undefined): { parentId?: string; title: string } {
  if (typeof init?.body !== 'string') return { title: '' };
  return JSON.parse(init.body) as { parentId?: string; title: string };
}

/** 用于构造按 URL 分发的内存文档服务。 */
function createDocumentServer(initial: readonly ServerDocument[]) {
  const documents = initial.map((document) => ({ ...document }));
  /** 用于按方法和路径响应文档树请求。 */
  function route(input: RequestInfo | URL, init?: RequestInit): Response {
    const url = toUrl(input);
    const method = init?.method ?? 'GET';
    if (method === 'GET' && url.pathname.endsWith('/documents')) {
      const parentId = url.searchParams.get('parentId');
      const items = documents.filter((document) => document.parentId === parentId).map(itemOf);
      return jsonResponse({ items, nextCursor: null });
    }
    if (method === 'POST' && url.pathname.endsWith('/documents')) {
      const created = appendDocument(documents, parseCreateBody(init));
      return jsonResponse(
        { ...itemOf(created), knowledgeBaseId: KNOWLEDGE_BASE_ID, parentId: created.parentId },
        201,
      );
    }
    return jsonResponse({ code: 'INTERNAL_ERROR', message: '不支持的操作。' }, 500);
  }
  return { documents, fetchMock: vi.fn(route) };
}

/** 用于在生产组件中渲染文档树。 */
function renderTree(desktop = true): ReturnType<typeof render> {
  return render(
    <DocumentTree
      desktop={desktop}
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

/** 用于在每个场景后恢复请求与 DOM 状态。 */
function resetScenario(): void {
  cleanup();
  onCreated.mockReset();
  vi.unstubAllGlobals();
}

afterEach(resetScenario);

/** 用于验证展开按钮的原生语义与按需拉取（键盘激活由原生 button 保证）。 */
async function expandsChildrenOnDemand(): Promise<void> {
  const server = createDocumentServer([
    { childCount: 1, id: 'parent-a', parentId: null, title: '父文档', version: 1 },
    { childCount: 0, id: 'child-a', parentId: 'parent-a', title: '子文档', version: 1 },
  ]);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  const chevron = await screen.findByRole('button', { name: '展开“父文档”' });
  expect(chevron).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(chevron);
  expect(await screen.findByTitle('子文档')).toBeVisible();
  expect(chevron).toHaveAttribute('aria-expanded', 'true');
  expect(callUrl(server.fetchMock.mock.calls[1])?.searchParams.get('parentId')).toBe('parent-a');
  fireEvent.click(screen.getByRole('button', { name: '折叠“父文档”' }));
  expect(screen.queryByTitle('子文档')).not.toBeInTheDocument();
}

/** 用于验证一个父节点展开失败不影响已成功区域。 */
async function keepsLoadedSiblingWhenAnotherExpandFails(): Promise<void> {
  const server = createDocumentServer([
    { childCount: 1, id: 'parent-a', parentId: null, title: '父甲', version: 1 },
    { childCount: 1, id: 'parent-b', parentId: null, title: '父乙', version: 1 },
    { childCount: 0, id: 'child-a', parentId: 'parent-a', title: '甲子', version: 1 },
    { childCount: 0, id: 'child-b', parentId: 'parent-b', title: '乙子', version: 1 },
  ]);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  fireEvent.click(await screen.findByRole('button', { name: '展开“父甲”' }));
  expect(await screen.findByTitle('甲子')).toBeVisible();
  server.fetchMock.mockImplementationOnce(() =>
    jsonResponse({ code: 'INTERNAL_ERROR', message: '暂时无法读取。' }, 500),
  );
  fireEvent.click(screen.getByRole('button', { name: '展开“父乙”' }));
  expect(await screen.findByText('子文档未加载')).toBeVisible();
  expect(screen.getByTitle('甲子')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
  expect(await screen.findByTitle('乙子')).toBeVisible();
  expect(screen.getByTitle('甲子')).toBeVisible();
}

/** 用于验证超出首页时按游标继续加载子节点。 */
async function loadsMoreChildrenWithCursor(): Promise<void> {
  /** 用于构造分页场景的最小树节点。 */
  const item = (id: string): DocumentTreeItem => ({
    childCount: 0,
    id,
    title: id,
    updatedAt: '2026-08-17T08:00:00.000000Z',
    version: 1,
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({ items: [item('node-1'), item('node-2')], nextCursor: 'page-2' }),
    )
    .mockResolvedValueOnce(jsonResponse({ items: [item('node-3')], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock);
  renderTree();
  expect(await screen.findByTitle('node-2')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
  expect(await screen.findByTitle('node-3')).toBeVisible();
  expect(callUrl(fetchMock.mock.calls[1])?.searchParams.get('cursor')).toBe('page-2');
  expect(screen.queryByRole('button', { name: '加载更多' })).not.toBeInTheDocument();
}

/** 用于验证可创建两级文档且重挂载后层级保持。 */
async function createsTwoLevelsAndPreservesHierarchy(): Promise<void> {
  const server = createDocumentServer([]);
  vi.stubGlobal('fetch', server.fetchMock);
  const view = renderTree();
  expect(await screen.findByText('还没有文档')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '新建首篇文档' }));
  const rootDialog = await screen.findByRole('dialog', { name: '新建文档' });
  fireEvent.change(within(rootDialog).getByRole('textbox', { name: '标题' }), {
    target: { value: ' 一级文档 ' },
  });
  fireEvent.click(within(rootDialog).getByRole('button', { name: '创建文档' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByTitle('一级文档')).toBeVisible();

  await chooseRowAction('一级文档', '新建子文档');
  const childDialog = await screen.findByRole('dialog', { name: '新建文档' });
  expect(within(childDialog).getByText(/一级文档/)).toBeVisible();
  fireEvent.change(within(childDialog).getByRole('textbox', { name: '标题' }), {
    target: { value: '二级文档' },
  });
  fireEvent.click(within(childDialog).getByRole('button', { name: '创建文档' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: '展开“一级文档”' }));
  expect(await screen.findByTitle('二级文档')).toBeVisible();
  const rootLi = screen.getByTitle('一级文档').closest('li');
  expect(within(rootLi!).getByTitle('二级文档')).toBeVisible();
  expect(onCreated).toHaveBeenCalledTimes(2);

  view.unmount();
  renderTree();
  fireEvent.click(await screen.findByRole('button', { name: '展开“一级文档”' }));
  expect(await screen.findByTitle('二级文档')).toBeVisible();
  const remountedLi = screen.getByTitle('一级文档').closest('li');
  expect(within(remountedLi!).getByTitle('二级文档')).toBeVisible();
}

/** 用于验证移动端阅读不提供修改控件。 */
async function omitsMobileModificationControls(): Promise<void> {
  const server = createDocumentServer([
    { childCount: 0, id: 'doc-1', parentId: null, title: '只读文档', version: 1 },
  ]);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree(false);
  expect(await screen.findByTitle('只读文档')).toBeVisible();
  expect(screen.queryByRole('button', { name: '新建文档' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /的文档操作/ })).not.toBeInTheDocument();
  cleanup();
  const emptyServer = createDocumentServer([]);
  vi.stubGlobal('fetch', emptyServer.fetchMock);
  renderTree(false);
  expect(await screen.findByText('还没有文档')).toBeVisible();
  expect(screen.queryByRole('button', { name: '新建首篇文档' })).not.toBeInTheDocument();
}

/** 用于验证长标题完整保留并可通过提示读取全文。 */
async function keepsLongTitleAccessible(): Promise<void> {
  const longTitle = '长'.repeat(200);
  const server = createDocumentServer([
    { childCount: 0, id: 'doc-long', parentId: null, title: longTitle, version: 1 },
  ]);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  const titleNode = await screen.findByTitle(longTitle);
  expect(titleNode).toHaveTextContent(longTitle);
}

test('expands children on demand with keyboard-operable buttons', expandsChildrenOnDemand);
test('keeps loaded siblings when another expand fails', keepsLoadedSiblingWhenAnotherExpandFails);
test('loads more children with the opaque cursor', loadsMoreChildrenWithCursor);
test(
  'creates two document levels and preserves hierarchy after remount',
  createsTwoLevelsAndPreservesHierarchy,
);
test('omits modification controls on mobile reading', omitsMobileModificationControls);
test('keeps a long title complete for truncation tooltips', keepsLongTitleAccessible);

/** 用于验证行标题链接进入文档编辑器且当前文档高亮。 */
async function opensDocumentEditorLinks(): Promise<void> {
  const server = createDocumentServer([
    { childCount: 0, id: 'doc-open', parentId: null, title: '可打开文档', version: 1 },
  ]);
  vi.stubGlobal('fetch', server.fetchMock);
  render(
    <DocumentTree
      activeDocumentId="doc-open"
      desktop
      knowledgeBaseId={KNOWLEDGE_BASE_ID}
      offline={false}
      onCreated={onCreated}
    />,
  );
  const rowLink = await screen.findByRole('link', { name: '可打开文档' });
  expect(rowLink).toHaveAttribute('href', `/knowledge/${KNOWLEDGE_BASE_ID}/documents/doc-open`);
  expect(rowLink).toHaveAttribute('aria-current', 'page');
  expect(rowLink).toHaveClass('font-medium');
  fireEvent.pointerDown(screen.getByRole('button', { name: '“可打开文档”的文档操作' }));
  expect(await screen.findByRole('menuitem', { name: '新建子文档' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: '打开文档' })).not.toBeInTheDocument();
}

test('opens the editor through row link with active highlight', opensDocumentEditorLinks);
