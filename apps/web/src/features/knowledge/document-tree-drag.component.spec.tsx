/** @fileoverview 验证文档树拖拽移动的载荷一致性、非法目标、快照恢复与幂等重试。 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { DocumentTree } from './document-tree';
import {
  createMoveServer,
  headerOf,
  moveCallsOf,
  parseMoveBody,
  toUrl,
  type ServerDocument,
} from './document-tree-move-test-server';

const KNOWLEDGE_BASE_ID = '11111111-1111-4111-8111-111111111111';
const onCreated = vi.fn();

/** 用于在生产组件中渲染文档树。 */
function renderTree(desktop = true, offline = false): ReturnType<typeof render> {
  return render(
    <DocumentTree
      desktop={desktop}
      knowledgeBaseId={KNOWLEDGE_BASE_ID}
      offline={offline}
      onCreated={onCreated}
    />,
  );
}

/** 用于提供 jsdom 缺失的最小数据传输对象。 */
function dataTransferOf(): { dropEffect: string; effectAllowed: string; setData: () => undefined } {
  return {
    dropEffect: '',
    effectAllowed: 'move',
    /** 用于满足处理器写入载荷的调用。 */
    setData: () => undefined,
  };
}

/** 用于在 act 内以指定指针位置派发一次可取消的拖拽事件。 */
function fireDrag(element: Element, type: string, clientY = 5): void {
  act(() => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { clientY, dataTransfer: dataTransferOf() });
    element.dispatchEvent(event);
  });
}

/** 用于让行元素返回可控矩形以推导放置意图。 */
function stubRect(element: Element, top: number, height: number): void {
  element.getBoundingClientRect =
    /** 用于返回测试可控的元素矩形。 */
    function rect(): DOMRect {
      return {
        bottom: top + height,
        height,
        left: 0,
        right: 0,
        top,
        width: 0,
        x: 0,
        y: top,
      } as DOMRect;
    };
}

/** 用于返回标题对应的可拖拽行容器。 */
function rowOf(title: string): HTMLElement {
  return screen.getByTitle(title).parentElement!;
}

/** 用于把 dragged 行拖放到 target 行的指定指针位置。 */
function dragRowOnto(dragged: string, target: string, clientY: number): void {
  const row = rowOf(target);
  stubRect(row, 0, 10);
  fireDrag(rowOf(dragged), 'dragstart');
  fireDrag(row, 'dragover', clientY);
  fireDrag(row, 'drop', clientY);
}

/** 用于读取并解析一次移动请求体。 */
function moveBodyOf(call: [RequestInfo | URL, RequestInit | undefined] | undefined) {
  return parseMoveBody(call?.[1]);
}

/** 用于按序读取根列表当前标题。 */
function rootTitles(): string[] {
  return screen.getAllByTitle(/^(甲|乙|丙|甲一)$/).map((node) => node.textContent ?? '');
}

/** 用于通过行菜单触发指定文档操作。 */
async function chooseRowAction(title: string, action: string): Promise<void> {
  fireEvent.pointerDown(screen.getByRole('button', { name: `“${title}”的文档操作` }));
  fireEvent.click(await screen.findByRole('menuitem', { name: action }));
}

/** 用于打开一个下拉并点选匹配选项。 */
async function chooseOption(trigger: HTMLElement, name: string | RegExp): Promise<void> {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  const option = await screen.findByRole('option', { name });
  fireEvent.pointerUp(option, { pointerType: 'mouse' });
  fireEvent.click(option);
}

/** 用于在每个场景后恢复请求与 DOM 状态。 */
function resetScenario(): void {
  cleanup();
  onCreated.mockReset();
  vi.unstubAllGlobals();
}

afterEach(resetScenario);

const INITIAL_ROOT = [
  { childCount: 0, id: 'doc-a', parentId: null, title: '甲', version: 1 },
  { childCount: 0, id: 'doc-c', parentId: null, title: '丙', version: 1 },
  { childCount: 0, id: 'doc-b', parentId: null, title: '乙', version: 1 },
] as const satisfies readonly ServerDocument[];

/** 用于验证拖拽到兄弟之前提交与键盘菜单一致的契约载荷。 */
async function dragBeforeSiblingMatchesKeyboardPayload(): Promise<void> {
  const dragServer = createMoveServer(INITIAL_ROOT);
  vi.stubGlobal('fetch', dragServer.fetchMock);
  renderTree();
  await screen.findByTitle('乙');
  dragRowOnto('乙', '丙', 2);
  const dragCall = moveCallsOf(dragServer.fetchMock)[0];
  expect(dragCall && toUrl(dragCall[0]).pathname).toBe('/api/v1/documents/doc-b/move');
  expect(dragCall && moveBodyOf(dragCall)).toEqual({ beforeId: 'doc-c', version: 1 });
  await waitFor(() => expect(rootTitles()).toEqual(['甲', '乙', '丙']));

  cleanup();
  const keyServer = createMoveServer(INITIAL_ROOT);
  vi.stubGlobal('fetch', keyServer.fetchMock);
  renderTree();
  await screen.findByTitle('乙');
  await chooseRowAction('乙', '移动到…');
  const dialog = await screen.findByRole('dialog', { name: '移动文档' });
  await chooseOption(within(dialog).getByRole('combobox', { name: '位置' }), '在“丙”之前');
  fireEvent.click(within(dialog).getByRole('button', { name: '移动文档' }));
  await waitFor(() => expect(moveCallsOf(keyServer.fetchMock)).toHaveLength(1));
  const keyCall = moveCallsOf(keyServer.fetchMock)[0];
  expect(keyCall && toUrl(keyCall[0]).pathname).toBe(dragCall && toUrl(dragCall[0]).pathname);
  expect(keyCall && moveBodyOf(keyCall)).toEqual(dragCall && moveBodyOf(dragCall));
}

/** 用于验证拖入行内追加为子文档并自动展开。 */
async function dragIntoRowAppendsAsChild(): Promise<void> {
  const server = createMoveServer([
    { childCount: 0, id: 'doc-a', parentId: null, title: '甲', version: 1 },
    { childCount: 0, id: 'doc-b', parentId: null, title: '乙', version: 1 },
  ]);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  await screen.findByTitle('乙');
  dragRowOnto('乙', '甲', 5);
  const call = moveCallsOf(server.fetchMock)[0];
  expect(call && moveBodyOf(call)).toEqual({ targetParentId: 'doc-a', version: 1 });
  await waitFor(() => {
    expect(screen.getByTitle('甲').closest('li')).toContainElement(screen.getByTitle('乙'));
  });
  expect(screen.getByRole('button', { name: '折叠“甲”' })).toHaveAttribute('aria-expanded', 'true');
}

/** 用于验证拖放到自身后代行被拒绝且不发出请求。 */
async function rejectsDropOnDescendantRow(): Promise<void> {
  const server = createMoveServer([
    { childCount: 1, id: 'doc-a', parentId: null, title: '甲', version: 1 },
    { childCount: 0, id: 'doc-a1', parentId: 'doc-a', title: '甲一', version: 1 },
    { childCount: 0, id: 'doc-b', parentId: null, title: '乙', version: 1 },
  ]);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  fireEvent.click(await screen.findByRole('button', { name: '展开“甲”' }));
  expect(await screen.findByTitle('甲一')).toBeVisible();
  stubRect(rowOf('甲一'), 0, 10);
  fireDrag(rowOf('甲'), 'dragstart');
  fireDrag(rowOf('甲一'), 'dragover', 5);
  expect(rowOf('甲一').querySelector('.bg-primary')).toBeNull();
  fireDrag(rowOf('甲一'), 'drop', 5);
  expect(moveCallsOf(server.fetchMock)).toHaveLength(0);
  expect(screen.getByTitle('甲').closest('li')).not.toContainElement(screen.getByTitle('乙'));
}

/** 用于验证版本冲突时恢复乐观快照并显示可行动提示。 */
async function restoresSnapshotAndNoticesOnConflict(): Promise<void> {
  const server = createMoveServer(INITIAL_ROOT);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  await screen.findByTitle('乙');
  const docB = server.documents.find((document) => document.id === 'doc-b');
  if (docB) docB.version = 5;
  dragRowOnto('乙', '丙', 2);
  expect(await screen.findByRole('alert')).toHaveTextContent(/在别处被修改/);
  await waitFor(() => expect(rootTitles()).toEqual(['甲', '丙', '乙']));
  expect(screen.queryByRole('button', { name: '重试移动' })).not.toBeInTheDocument();
}

/** 用于验证网络不确定失败后重试复用幂等键且不重复应用。 */
async function retryReusesIdempotencyKeyWithoutDoubleMove(): Promise<void> {
  const server = createMoveServer(INITIAL_ROOT, true);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  await screen.findByTitle('乙');
  dragRowOnto('乙', '丙', 2);
  expect(await screen.findByRole('alert')).toHaveTextContent(/无法连接/);
  await waitFor(() => expect(rootTitles()).toEqual(['甲', '丙', '乙']));
  const firstKey = headerOf(moveCallsOf(server.fetchMock)[0]?.[1], 'Idempotency-Key');
  fireEvent.click(screen.getByRole('button', { name: '重试移动' }));
  await waitFor(() => expect(moveCallsOf(server.fetchMock)).toHaveLength(2));
  const secondCall = moveCallsOf(server.fetchMock)[1];
  expect(headerOf(secondCall?.[1], 'Idempotency-Key')).toBe(firstKey);
  expect(secondCall && moveBodyOf(secondCall)).toEqual({ beforeId: 'doc-c', version: 1 });
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(server.counter.applied).toBe(1);
  await waitFor(() => expect(rootTitles()).toEqual(['甲', '乙', '丙']));
}

/** 用于验证拖到根区域空白处移动到顶层末尾。 */
async function dropOnRootAreaMovesToTopLevelEnd(): Promise<void> {
  const server = createMoveServer([
    { childCount: 1, id: 'doc-a', parentId: null, title: '甲', version: 1 },
    { childCount: 0, id: 'doc-a1', parentId: 'doc-a', title: '甲一', version: 1 },
  ]);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  fireEvent.click(await screen.findByRole('button', { name: '展开“甲”' }));
  expect(await screen.findByTitle('甲一')).toBeVisible();
  const rootArea = screen.getByTitle('甲').closest('ul')!.parentElement!.parentElement!;
  fireDrag(rowOf('甲一'), 'dragstart');
  fireDrag(rootArea, 'dragover', 30);
  fireDrag(rootArea, 'drop', 30);
  const call = moveCallsOf(server.fetchMock)[0];
  expect(call && moveBodyOf(call)).toEqual({ version: 1 });
  await waitFor(() => expect(rootTitles()).toEqual(['甲', '甲一']));
}

/** 用于验证拖到兄弟之后提交 afterId 载荷并稳定落位。 */
async function dragAfterSiblingSendsAfterId(): Promise<void> {
  const server = createMoveServer(INITIAL_ROOT);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  await screen.findByTitle('乙');
  dragRowOnto('丙', '甲', 9);
  const call = moveCallsOf(server.fetchMock)[0];
  expect(call && moveBodyOf(call)).toEqual({ afterId: 'doc-a', version: 1 });
  await waitFor(() => expect(rootTitles()).toEqual(['甲', '丙', '乙']));
}

/** 用于验证嵌套子区域空白处的放置不冒泡为顶层移动。 */
async function ignoresDropOnNestedBlankArea(): Promise<void> {
  const server = createMoveServer([
    { childCount: 1, id: 'doc-a', parentId: null, title: '甲', version: 1 },
    { childCount: 0, id: 'doc-a1', parentId: 'doc-a', title: '甲一', version: 1 },
    { childCount: 0, id: 'doc-b', parentId: null, title: '乙', version: 1 },
  ]);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree();
  fireEvent.click(await screen.findByRole('button', { name: '展开“甲”' }));
  expect(await screen.findByTitle('甲一')).toBeVisible();
  const nestedArea = screen.getByTitle('甲一').closest('ul')!.parentElement!;
  fireDrag(rowOf('乙'), 'dragstart');
  fireDrag(nestedArea, 'dragover', 40);
  fireDrag(nestedArea, 'drop', 40);
  expect(moveCallsOf(server.fetchMock)).toHaveLength(0);
}

/** 用于验证离线时行不启用拖拽。 */
async function disablesDraggingWhileOffline(): Promise<void> {
  const server = createMoveServer(INITIAL_ROOT);
  vi.stubGlobal('fetch', server.fetchMock);
  renderTree(true, true);
  await screen.findByTitle('乙');
  expect(document.querySelectorAll('[draggable="true"]')).toHaveLength(0);
}

/** 用于返回注入幂等键冲突的最小 409 响应。 */
function conflictResponse(): Response {
  return {
    /** 用于返回确定的冲突载荷。 */
    json: () => Promise.resolve({ code: 'IDEMPOTENCY_CONFLICT', message: '键冲突。' }),
    status: 409,
  } as Response;
}

/** 用于验证幂等键冲突后的下一次移动换用新键。 */
async function issuesFreshKeyAfterIdempotencyConflict(): Promise<void> {
  const server = createMoveServer(INITIAL_ROOT);
  let moveAttempts = 0;
  const conflicting = vi.fn(
    /** 用于首次移动注入幂等键冲突，其余请求转交内存服务。 */
    (input: RequestInfo | URL, init?: RequestInit): Response => {
      moveAttempts +=
        (init?.method ?? 'GET') === 'POST' && toUrl(input).pathname.endsWith('/move') ? 1 : 0;
      if (moveAttempts === 1) return conflictResponse();
      return server.fetchMock(input, init);
    },
  );
  vi.stubGlobal('fetch', conflicting);
  renderTree();
  await screen.findByTitle('乙');
  dragRowOnto('乙', '丙', 2);
  expect(await screen.findByText(/键冲突/)).toBeVisible();
  const firstKey = headerOf(moveCallsOf(conflicting)[0]?.[1], 'Idempotency-Key');
  dragRowOnto('乙', '丙', 2);
  await waitFor(() => expect(moveCallsOf(conflicting)).toHaveLength(2));
  const secondKey = headerOf(moveCallsOf(conflicting)[1]?.[1], 'Idempotency-Key');
  expect(secondKey).not.toBe(firstKey);
  expect(server.counter.applied).toBe(1);
  await waitFor(() => expect(rootTitles()).toEqual(['甲', '乙', '丙']));
}

test(
  'drag before a sibling matches the keyboard menu payload',
  dragBeforeSiblingMatchesKeyboardPayload,
);
test('drag into a row appends as a child and expands it', dragIntoRowAppendsAsChild);
test('rejects dropping onto a descendant row', rejectsDropOnDescendantRow);
test(
  'restores the optimistic snapshot and notices on version conflict',
  restoresSnapshotAndNoticesOnConflict,
);
test(
  'retry reuses the idempotency key without double move',
  retryReusesIdempotencyKeyWithoutDoubleMove,
);
test('drop on the root area moves to the top level end', dropOnRootAreaMovesToTopLevelEnd);
test('drag after a sibling sends the afterId payload', dragAfterSiblingSendsAfterId);
test('ignores drops on nested blank areas', ignoresDropOnNestedBlankArea);
test('disables dragging while offline', disablesDraggingWhileOffline);
test(
  'issues a fresh idempotency key after an idempotency conflict',
  issuesFreshKeyAfterIdempotencyConflict,
);
