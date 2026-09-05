/** @fileoverview 验证书架列表渲染、空态结构与新建教程最小创建流。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { TutorialsPage } from './tutorials-page';

const routerPush = vi.fn();

vi.mock('next/navigation', () => ({
  /** 用于提供创建成功后跳转所需的最小路由接口。 */
  useRouter: () => ({ push: routerPush }),
}));

beforeEach(() => {
  window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  routerPush.mockClear();
  vi.unstubAllGlobals();
});

/** 用于构造最小 Fetch JSON 响应。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于返回无需传输解析的确定响应载荷。 */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** 用于安装按地址路由的 fetch 桩并返回桩函数。 */
function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn(
    /** 用于返回按地址路由后的确定响应。 */
    (input: string | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** 用于构造书架条目的最小载荷。 */
function shelfItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    continueTo: {
      chapterTitle: '渲染原理',
      documentId: 'doc-1',
      knowledgeBaseId: 'kb-1',
    },
    createdAt: '2026-09-01T08:00:00.000Z',
    id: 'tut-1',
    knowledgeBase: { id: 'kb-1', kind: 'tutorial' },
    progress: { completed: 2, failed: 1, total: 3 },
    status: 'partial',
    topic: 'React 性能优化',
    updatedAt: '2026-09-03T08:00:00.000Z',
    ...overrides,
  };
}

/** 用于验证书架卡片渲染标题、进度、状态、徽标与继续阅读。 */
test('渲染书架卡片与进度、徽标、继续阅读', async () => {
  stubFetch((url) =>
    url.includes('/api/v1/tutorials') ? jsonResponse([shelfItem()]) : jsonResponse([]),
  );
  render(<TutorialsPage />);
  expect(await screen.findByRole('link', { name: /React 性能优化/ })).toHaveAttribute(
    'href',
    '/tutorials/tut-1',
  );
  expect(screen.getByText(/进度 2\/3 章，1 章失败/)).toBeInTheDocument();
  expect(screen.getByText('部分完成')).toBeInTheDocument();
  expect(screen.getByLabelText('教程产出库')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '继续阅读：渲染原理' })).toHaveAttribute(
    'href',
    '/knowledge/kb-1/documents/doc-1',
  );
});

/** 用于验证空书架展示结构化空态与唯一主行动。 */
test('空书架展示结构化空态', async () => {
  stubFetch((url) => (url.includes('/api/v1/tutorials') ? jsonResponse([]) : jsonResponse([])));
  render(<TutorialsPage />);
  expect(await screen.findByText('还没有教程')).toBeInTheDocument();
  const actions = screen.getAllByRole('button', { name: '新建教程' });
  expect(actions.length).toBeGreaterThan(0);
});

/** 用于验证列表读取失败提供就地重试。 */
test('列表读取失败展示重试入口', async () => {
  let failed = true;
  stubFetch((url) =>
    url.includes('/api/v1/tutorials')
      ? failed
        ? jsonResponse({ code: 'INTERNAL_ERROR', message: '服务内部错误' }, 500)
        : jsonResponse([shelfItem()])
      : jsonResponse([]),
  );
  render(<TutorialsPage />);
  expect(await screen.findByText('无法读取教程')).toBeInTheDocument();
  failed = false;
  fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
  expect(await screen.findByText('部分完成')).toBeInTheDocument();
});

/** 用于验证新建弹窗以最小载荷创建并跳转 compose。 */
test('新建教程提交最小载荷并跳转创作', async () => {
  const fetchMock = stubFetch((url, init) => {
    if (url === '/api/v1/tutorials' && init?.method === 'POST') {
      return jsonResponse({ id: 'tut-new' }, 201);
    }
    return jsonResponse([]);
  });
  render(<TutorialsPage />);
  fireEvent.click(await screen.findByRole('button', { name: '新建教程' }));
  fireEvent.change(await screen.findByLabelText('主题（必填）'), {
    target: { value: 'Rust 入门' },
  });
  fireEvent.click(screen.getByRole('button', { name: '创建并开始创作' }));
  await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/tutorials/tut-new/compose'));
  const createCall = fetchMock.mock.calls.find(
    (call) => String(call[0]) === '/api/v1/tutorials' && call[1]?.method === 'POST',
  );
  const body = createCall?.[1]?.body as string | undefined;
  const payload: unknown = JSON.parse(body ?? '{}');
  expect(payload).toMatchObject({ depth: 'standard', topic: 'Rust 入门' });
  expect(payload).not.toHaveProperty('audience');
});
