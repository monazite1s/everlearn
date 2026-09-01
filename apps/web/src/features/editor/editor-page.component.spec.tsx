/** @fileoverview 验证编辑器页面的设备分支、删除态、离线与树高亮行为。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DocumentContentDetail } from '@everlearn/contracts';
import { afterEach, expect, test, vi } from 'vitest';

import { EditorPage } from './editor-page';

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const KB_ID = '22222222-2222-4222-8222-222222222222';
const BLOCK_ID = '33333333-3333-4333-8333-333333333333';
const fetchMock = vi.fn();

/** 用于从测试地址提供与 Next 兼容的只读查询参数。 */
function useMockSearchParams(): URLSearchParams {
  return new URLSearchParams(window.location.search);
}

/** 用于提供编辑页消费的最小 App Router 查询接口。 */
function createNavigationMock() {
  return { useSearchParams: useMockSearchParams };
}

vi.mock('next/navigation', createNavigationMock);

/** 用于构造最小内容投影。 */
function contentDetail(): DocumentContentDetail {
  return {
    childCount: 0,
    contentJson: {
      content: [{ content: [{ text: '只读正文段落', type: 'text' }], type: 'paragraph' }],
      type: 'doc',
    },
    id: DOC_ID,
    knowledgeBaseId: KB_ID,
    parentId: null,
    schemaVersion: 1,
    title: '目标文档',
    updatedAt: '2026-08-17T08:00:00.000Z',
    version: 1,
  };
}

/** 用于构造带稳定 Block ID 的搜索定位正文。 */
function searchableDetail(version = 3): DocumentContentDetail {
  return {
    ...contentDetail(),
    contentJson: {
      content: [
        {
          attrs: { blockId: BLOCK_ID },
          content: [{ text: '搜索命中正文', type: 'text' }],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    },
    version,
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

/** 用于按编辑与三栏两个断点返回确定匹配结果。 */
function matchViewport(min48: boolean, min80 = false): (query: string) => MediaQueryList {
  return (query) =>
    ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query.includes('80') ? min80 : min48,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }) as MediaQueryList;
}

/** 用于在指定视口下挂载页面并预置内容响应。 */
function mountPage(desktop: boolean): ReturnType<typeof render> {
  vi.stubGlobal('matchMedia', matchViewport(desktop));
  return render(<EditorPage docId={DOC_ID} knowledgeBaseId={KB_ID} />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  window.history.replaceState({}, '', '/');
});

test('移动端以只读渲染器展示正文且不创建编辑实例', async () => {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = toUrl(input);
    if (url.pathname.endsWith(`/documents/${DOC_ID}/content`)) {
      return Promise.resolve(jsonResponse(contentDetail()));
    }
    return Promise.resolve(jsonResponse({ code: 'INTERNAL_ERROR', message: '不支持' }, 500));
  });
  vi.stubGlobal('fetch', fetchMock);
  mountPage(false);
  expect(await screen.findByText('只读正文段落')).toBeVisible();
  expect(screen.getByText('移动端暂不支持编辑，当前展示只读版本。')).toBeVisible();
  expect(screen.queryByRole('textbox', { name: '文档正文' })).not.toBeInTheDocument();
  expect(document.querySelector('.ProseMirror[contenteditable]')).toBeNull();
  expect(screen.queryByRole('toolbar', { name: '格式化' })).not.toBeInTheDocument();
});

test('内容 404 时整页转为删除态并提供回收站入口', async () => {
  fetchMock.mockImplementation(() =>
    Promise.resolve(
      jsonResponse({ code: 'NOT_FOUND', message: '文档不存在。', requestId: 'r' }, 404),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  mountPage(true);
  expect(await screen.findByText('文档已删除')).toBeVisible();
  expect(screen.getByRole('link', { name: '前往回收站' })).toHaveAttribute(
    'href',
    '/knowledge/trash',
  );
});

test('桌面端渲染编辑器且文档树由共享布局承载', async () => {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = toUrl(input);
    if (url.pathname.endsWith(`/documents/${DOC_ID}/content`)) {
      return Promise.resolve(jsonResponse(contentDetail()));
    }
    return Promise.resolve(jsonResponse({ code: 'INTERNAL_ERROR', message: '不支持' }, 500));
  });
  vi.stubGlobal('fetch', fetchMock);
  mountPage(true);
  expect(await screen.findByRole('textbox', { name: '文档正文' })).toBeVisible();
  expect(screen.getByLabelText('文档标题')).toHaveValue('目标文档');
  expect(screen.queryByRole('complementary', { name: '文档树' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: '文档正文（只读）' })).not.toBeInTheDocument();
});

test('读取失败提供就地重试且重试后恢复', async () => {
  let contentAttempts = 0;
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = toUrl(input);
    if (url.pathname.endsWith(`/documents/${DOC_ID}/content`)) {
      contentAttempts += 1;
      if (contentAttempts === 1) {
        return Promise.resolve(
          jsonResponse({ code: 'INTERNAL_ERROR', message: '服务暂不可用' }, 500),
        );
      }
      return Promise.resolve(jsonResponse(contentDetail()));
    }
    return Promise.resolve(jsonResponse({ code: 'INTERNAL_ERROR', message: '不支持' }, 500));
  });
  vi.stubGlobal('fetch', fetchMock);
  mountPage(false);
  expect(await screen.findByText('文档未加载')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
  await waitFor(() => expect(screen.getByText('只读正文段落')).toBeVisible());
});

test('离线时桌面端展示离线提示并禁用工具栏', async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
  window.dispatchEvent(new Event('offline'));
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = toUrl(input);
    if (url.pathname.endsWith(`/documents/${DOC_ID}/content`)) {
      return Promise.resolve(jsonResponse(contentDetail()));
    }
    return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
  });
  vi.stubGlobal('fetch', fetchMock);
  mountPage(true);
  expect(await screen.findByText('当前离线：正文转为只读，编辑与上传暂不可用。')).toBeVisible();
  expect(screen.getByRole('button', { name: '粗体' })).toHaveAttribute('aria-disabled', 'true');
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});

test('移动只读正文按深链定位版本已变化但仍存在的 Block', async () => {
  Element.prototype.scrollIntoView = vi.fn();
  window.history.replaceState({}, '', `/?searchBlockId=${BLOCK_ID}&searchDocumentVersion=2`);
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = toUrl(input);
    return Promise.resolve(
      url.pathname.endsWith(`/documents/${DOC_ID}/content`)
        ? jsonResponse(searchableDetail(3))
        : jsonResponse({ code: 'INTERNAL_ERROR', message: '不支持' }, 500),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  mountPage(false);
  const block = await screen.findByText('搜索命中正文');
  await waitFor(() => expect(block).toHaveFocus());
  expect(await screen.findByRole('status')).toHaveTextContent('文档已更新，已定位到原匹配位置');
});

test('桌面编辑正文按合法深链定位真实 Block', async () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  window.history.replaceState({}, '', `/?searchBlockId=${BLOCK_ID}&searchDocumentVersion=3`);
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    const url = toUrl(input);
    return Promise.resolve(
      url.pathname.endsWith(`/documents/${DOC_ID}/content`)
        ? jsonResponse(searchableDetail())
        : jsonResponse({ code: 'INTERNAL_ERROR', message: '不支持' }, 500),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  mountPage(true);
  const block = await screen.findByText('搜索命中正文');
  await waitFor(() => expect(block).toHaveAttribute('data-search-target', 'true'));
  expect(block).toHaveAttribute('tabindex', '-1');
  expect(scroll).toHaveBeenCalled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

test('非法或标题专用地址不执行 Block 定位', async () => {
  const scroll = vi.fn();
  Element.prototype.scrollIntoView = scroll;
  window.history.replaceState({}, '', `/?searchBlockId=not-a-uuid&searchDocumentVersion=3`);
  fetchMock.mockResolvedValue(jsonResponse(searchableDetail()));
  vi.stubGlobal('fetch', fetchMock);
  mountPage(false);
  await screen.findByText('搜索命中正文');
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(scroll).not.toHaveBeenCalled();
});
