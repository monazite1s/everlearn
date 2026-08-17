/** @fileoverview 验证修订时间轴的加载、预览、恢复确认与分页行为。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DocumentContentDetail, DocumentRevisionListItem } from '@everlearn/contracts';
import { afterEach, expect, test, vi } from 'vitest';

import { RevisionTimelinePanel } from './revisions-panel';
import { useRevisions } from './use-revisions';

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const fetchMock = vi.fn();

/** 用于构造单个修订摘要条目。 */
function revisionItem(overrides: Partial<DocumentRevisionListItem> = {}): DocumentRevisionListItem {
  return {
    createdAt: '2026-08-17T08:00:00.000Z',
    revisionNumber: 1,
    snippet: '第一版正文摘要',
    source: 'manual',
    title: '文档标题',
    ...overrides,
  };
}

/** 用于把 Fetch 输入收敛为可解析的 URL 对象。 */
function toUrl(input: RequestInfo | URL): URL {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return new URL(raw, 'http://localhost');
}

/** 用于构造最小响应桩。 */
/** 用于返回确定响应载荷的桩函数。 */
const jsonStub =
  (body: unknown): (() => Promise<unknown>) =>
  () =>
    Promise.resolve(body);

/** 用于构造最小响应桩。 */
function jsonResponse(body: unknown, status = 200): Response {
  return { json: jsonStub(body), status } as Response;
}

/** 用于构造恢复成功返回的内容投影。 */
function contentDetail(): DocumentContentDetail {
  return {
    childCount: 0,
    contentJson: { content: [], type: 'doc' },
    id: DOC_ID,
    knowledgeBaseId: '22222222-2222-4222-8222-222222222222',
    parentId: null,
    schemaVersion: 1,
    title: '文档标题',
    updatedAt: '2026-08-17T09:00:00.000Z',
    version: 5,
  };
}

/** 用于以真实列表 hook 桥接面板渲染的测试容器。 */
function PanelHarness(props: { onRestored: (detail: DocumentContentDetail) => void }) {
  const revisions = useRevisions({ documentId: DOC_ID });
  return (
    <RevisionTimelinePanel
      documentId={DOC_ID}
      getVersion={() => 4}
      onRestored={props.onRestored}
      revisions={revisions}
    />
  );
}

/** 用于承接未传恢复回调时的占位。 */
const noopRestored = (): void => undefined;

/** 用于挂载时间轴面板。 */
function mountPanel(
  onRestored: (detail: DocumentContentDetail) => void,
): ReturnType<typeof render> {
  return render(<PanelHarness onRestored={onRestored} />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

test('渲染时间轴条目与来源徽标并按修订号展示', async () => {
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      jsonResponse({
        items: [
          revisionItem({ revisionNumber: 2, source: 'restore', snippet: '恢复版本摘要' }),
          revisionItem(),
        ],
        nextCursor: null,
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  mountPanel(noopRestored);
  expect(await screen.findByText('#2')).toBeVisible();
  expect(screen.getByText('恢复')).toBeVisible();
  expect(screen.getByText('手动')).toBeVisible();
  expect(screen.getByText('第一版正文摘要')).toBeVisible();
});

test('点击条目加载只读预览并在恢复确认后回传新内容', async () => {
  const onRestored = vi.fn();
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = toUrl(input);
    if (url.pathname.endsWith('/revisions') && (init?.method ?? 'GET') === 'GET') {
      return Promise.resolve(jsonResponse({ items: [revisionItem()], nextCursor: null }));
    }
    if (url.pathname.endsWith('/revisions/1') && !url.pathname.endsWith('restore')) {
      return Promise.resolve(
        jsonResponse({
          contentJson: { content: [], type: 'doc' },
          createdAt: '2026-08-17T08:00:00.000Z',
          plainText: '预览正文内容',
          revisionNumber: 1,
          schemaVersion: 1,
          snippet: '第一版正文摘要',
          source: 'manual',
          title: '修订标题',
        }),
      );
    }
    if (url.pathname.endsWith('/restore')) {
      return Promise.resolve(jsonResponse(contentDetail()));
    }
    return Promise.resolve(jsonResponse({ code: 'INTERNAL_ERROR', message: '不支持' }, 500));
  });
  vi.stubGlobal('fetch', fetchMock);
  mountPanel(onRestored);
  fireEvent.click(await screen.findByText('#1'));
  expect(await screen.findByText('预览正文内容')).toBeVisible();
  expect(screen.getByText('修订标题')).toBeVisible();

  fireEvent.click(screen.getByRole('button', { name: '恢复此版本' }));
  expect(
    screen.getByText('将创建新的恢复修订，不会改写历史；当前正文中未保存的改动将被替换。'),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '确认恢复' }));
  await waitFor(() =>
    expect(onRestored).toHaveBeenCalledWith(expect.objectContaining({ version: 5 })),
  );
});

test('存在下一页时提供加载更多并追加结果', async () => {
  fetchMock.mockImplementationOnce(() =>
    Promise.resolve(
      jsonResponse({ items: [revisionItem({ revisionNumber: 1 })], nextCursor: 'cur-1' }),
    ),
  );
  fetchMock.mockImplementationOnce(() =>
    Promise.resolve(
      jsonResponse({ items: [revisionItem({ revisionNumber: 2 })], nextCursor: null }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  mountPanel(noopRestored);
  expect(await screen.findByText('#1')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
  expect(await screen.findByText('#2')).toBeVisible();
});

test('空列表展示尚无修订空态', async () => {
  fetchMock.mockImplementation(() =>
    Promise.resolve(jsonResponse({ items: [], nextCursor: null })),
  );
  vi.stubGlobal('fetch', fetchMock);
  mountPanel(noopRestored);
  expect(await screen.findByText('尚无修订。')).toBeVisible();
});

test('首屏失败展示就地重试且重试后恢复', async () => {
  fetchMock
    .mockImplementationOnce(() =>
      Promise.resolve(jsonResponse({ code: 'INTERNAL_ERROR', message: '服务暂不可用' }, 500)),
    )
    .mockImplementationOnce(() =>
      Promise.resolve(jsonResponse({ items: [revisionItem()], nextCursor: null })),
    );
  vi.stubGlobal('fetch', fetchMock);
  mountPanel(noopRestored);
  expect(await screen.findByText('修订历史未加载。')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(await screen.findByText('#1')).toBeVisible();
});
