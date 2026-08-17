/** @fileoverview 验证键盘移动对话框的载荷、非法目标、失败恢复与移动端约束。 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import { DocumentTree } from './document-tree';
import {
  createMoveServer,
  headerOf,
  moveCallsOf,
  parseMoveBody,
  toUrl,
} from './document-tree-move-test-server';

const KNOWLEDGE_BASE_ID = '11111111-1111-4111-8111-111111111111';
const onCreated = vi.fn();

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

/** 用于打开一个下拉并点选匹配选项。 */
async function chooseOption(trigger: HTMLElement, name: string | RegExp): Promise<void> {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  const option = await screen.findByRole('option', { name });
  fireEvent.pointerUp(option, { pointerType: 'mouse' });
  fireEvent.click(option);
}

/** 用于返回首个移动请求的调用信息。 */
function moveCallOf(fetchMock: ReturnType<typeof vi.fn>) {
  return moveCallsOf(fetchMock)[0];
}

/** 用于读取并解析移动请求体。 */
function moveBodyOf(call: [RequestInfo | URL, RequestInit | undefined] | undefined) {
  return parseMoveBody(call?.[1]);
}

/** 用于按序读取根列表当前标题。 */
function rootTitles(): string[] {
  return screen.getAllByTitle(/^(甲|乙|丙)$/).map((node) => node.textContent ?? '');
}

/** 用于在每个场景后恢复请求与 DOM 状态。 */
function resetScenario(): void {
  cleanup();
  onCreated.mockReset();
  vi.unstubAllGlobals();
}

beforeAll(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(resetScenario);

/** 用于验证键盘按锚点移动提交契约载荷并刷新顺序。 */
async function movesBeforeAnchorSiblingViaMenu(): Promise<void> {
  const server = createMoveServer([
    { childCount: 0, id: 'doc-a', parentId: null, title: '甲', version: 1 },
    { childCount: 0, id: 'doc-c', parentId: null, title: '丙', version: 1 },
    { childCount: 0, id: 'doc-b', parentId: null, title: '乙', version: 1 },
  ]);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  await screen.findByTitle('丙');
  await chooseRowAction('乙', '移动到…');
  const dialog = await screen.findByRole('dialog', { name: '移动文档' });
  await chooseOption(within(dialog).getByRole('combobox', { name: '目标父级' }), '知识库顶层');
  await chooseOption(within(dialog).getByRole('combobox', { name: '位置' }), '在“丙”之前');
  fireEvent.click(within(dialog).getByRole('button', { name: '移动文档' }));
  const call = moveCallOf(server.fetchMock);
  expect(call && toUrl(call[0]).pathname).toBe('/api/v1/documents/doc-b/move');
  expect(moveBodyOf(call)).toEqual({ beforeId: 'doc-c', version: 1 });
  expect(call && headerOf(call[1], 'Idempotency-Key').length).toBeGreaterThan(0);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(rootTitles()).toEqual(['甲', '乙', '丙']);
}

/** 用于验证键盘移入父级末尾并保持子树展开。 */
async function movesIntoParentAndKeepsSubtreeExpanded(): Promise<void> {
  const server = createMoveServer([
    { childCount: 1, id: 'doc-a', parentId: null, title: '甲', version: 1 },
    { childCount: 0, id: 'doc-a1', parentId: 'doc-a', title: '甲一', version: 1 },
    { childCount: 0, id: 'doc-b', parentId: null, title: '乙', version: 1 },
  ]);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  fireEvent.click(await screen.findByRole('button', { name: '展开“甲”' }));
  expect(await screen.findByTitle('甲一')).toBeVisible();
  await chooseRowAction('乙', '移动到…');
  const dialog = await screen.findByRole('dialog', { name: '移动文档' });
  await chooseOption(within(dialog).getByRole('combobox', { name: '目标父级' }), '甲');
  fireEvent.click(within(dialog).getByRole('button', { name: '移动文档' }));
  const call = moveCallOf(server.fetchMock);
  expect(moveBodyOf(call)).toEqual({ targetParentId: 'doc-a', version: 1 });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const parentLi = screen.getByTitle('甲').closest('li');
  expect(parentLi).toContainElement(screen.getByTitle('乙'));
  expect(screen.getByTitle('甲一')).toBeVisible();
  expect(screen.getByRole('button', { name: '折叠“甲”' })).toHaveAttribute('aria-expanded', 'true');
}

/** 用于验证下拉中自身与后代目标被禁用并说明原因。 */
async function disablesSelfAndDescendantOptions(): Promise<void> {
  const server = createMoveServer([
    { childCount: 1, id: 'doc-a', parentId: null, title: '甲', version: 1 },
    { childCount: 0, id: 'doc-a1', parentId: 'doc-a', title: '甲一', version: 1 },
    { childCount: 0, id: 'doc-b', parentId: null, title: '乙', version: 1 },
  ]);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  fireEvent.click(await screen.findByRole('button', { name: '展开“甲”' }));
  expect(await screen.findByTitle('甲一')).toBeVisible();
  await chooseRowAction('甲', '移动到…');
  const dialog = await screen.findByRole('dialog', { name: '移动文档' });
  fireEvent.pointerDown(within(dialog).getByRole('combobox', { name: '目标父级' }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  });
  const selfOption = await screen.findByRole('option', { name: '甲（自身或其后代）' });
  const childOption = await screen.findByRole('option', { name: '甲 / 甲一（自身或其后代）' });
  expect(selfOption).toHaveAttribute('aria-disabled', 'true');
  expect(childOption).toHaveAttribute('aria-disabled', 'true');
  expect(await screen.findByRole('option', { name: '知识库顶层' })).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );
}

/** 用于验证版本冲突时恢复快照、保留选择并可在重读后重试。 */
async function keepsSelectionAndDialogWhenVersionConflicts(): Promise<void> {
  const server = createMoveServer([
    { childCount: 0, id: 'doc-a', parentId: null, title: '甲', version: 1 },
    { childCount: 0, id: 'doc-c', parentId: null, title: '丙', version: 1 },
    { childCount: 0, id: 'doc-b', parentId: null, title: '乙', version: 1 },
  ]);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  await screen.findByTitle('乙');
  const docB = server.documents.find((document) => document.id === 'doc-b');
  if (docB) docB.version = 5;
  await chooseRowAction('乙', '移动到…');
  const dialog = await screen.findByRole('dialog', { name: '移动文档' });
  await chooseOption(within(dialog).getByRole('combobox', { name: '位置' }), '在“丙”之前');
  fireEvent.click(within(dialog).getByRole('button', { name: '移动文档' }));
  expect(await within(dialog).findByText(/在别处被修改/)).toBeVisible();
  expect(within(dialog).getByRole('combobox', { name: '位置' })).toHaveTextContent('在“丙”之前');
  expect(screen.queryByRole('dialog')).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: '移动文档' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(rootTitles()).toEqual(['甲', '乙', '丙']);
}

/** 用于验证移动端阅读不渲染任何移动控件。 */
async function omitsMobileMoveControls(): Promise<void> {
  const server = createMoveServer([
    { childCount: 0, id: 'doc-a', parentId: null, title: '只读文档', version: 1 },
  ]);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree(false);
  expect(await screen.findByTitle('只读文档')).toBeVisible();
  expect(document.querySelectorAll('[draggable="true"]')).toHaveLength(0);
  expect(screen.queryByRole('button', { name: /的文档操作/ })).not.toBeInTheDocument();
}

/** 用于验证移动结果在重挂载后保持服务端顺序。 */
async function keepsOrderAfterRemount(): Promise<void> {
  const server = createMoveServer([
    { childCount: 0, id: 'doc-a', parentId: null, title: '甲', version: 1 },
    { childCount: 0, id: 'doc-c', parentId: null, title: '丙', version: 1 },
    { childCount: 0, id: 'doc-b', parentId: null, title: '乙', version: 1 },
  ]);
  vi.stubGlobal('fetch', server.fetchMock);
  const view = renderTree();
  await screen.findByTitle('乙');
  await chooseRowAction('乙', '移动到…');
  const dialog = await screen.findByRole('dialog', { name: '移动文档' });
  await chooseOption(within(dialog).getByRole('combobox', { name: '位置' }), '在“丙”之前');
  fireEvent.click(within(dialog).getByRole('button', { name: '移动文档' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  view.unmount();
  renderTree();
  await screen.findByTitle('乙');
  expect(rootTitles()).toEqual(['甲', '乙', '丙']);
}

test('moves before an anchor sibling via the keyboard menu', movesBeforeAnchorSiblingViaMenu);
test(
  'moves into a parent at the end and keeps subtree expanded',
  movesIntoParentAndKeepsSubtreeExpanded,
);
test('disables self and descendant options with reasons', disablesSelfAndDescendantOptions);
test(
  'keeps selection and dialog when version conflicts',
  keepsSelectionAndDialogWhenVersionConflicts,
);
test('omits move controls on mobile reading', omitsMobileMoveControls);
test('keeps server order after remount', keepsOrderAfterRemount);
