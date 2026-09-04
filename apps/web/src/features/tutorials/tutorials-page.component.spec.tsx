/** @fileoverview 验证教程列表渲染与创建教程提交交互。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { TutorialsPage } from './tutorials-page';

afterEach(() => {
  cleanup();
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

/** 用于按 URL 路由教程与知识库列表响应。 */
function stubListFetch(handler: (url: string) => Response): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      /** 用于返回路由后的确定响应。 */
      (input: string | URL) => Promise.resolve(handler(String(input))),
    ),
  );
}

/** 用于按路径匹配 fetch 调用。 */
function lastCallUrl(fn: ReturnType<typeof vi.fn>): string {
  const call = fn.mock.calls.at(-1);
  return String(call?.[0]);
}

/** 用于验证列表渲染教程卡片与计数。 */
test('渲染教程列表卡片', async () => {
  stubListFetch((url) =>
    url.includes('/api/v1/tutorials')
      ? jsonResponse([
          {
            chapterCounts: { failed: 1, pending: 0, succeeded: 2, total: 3 },
            createdAt: '2026-09-01T08:00:00.000Z',
            id: 'tut-1',
            status: 'partial',
            topic: 'React 性能优化',
          },
        ])
      : jsonResponse({ items: [], nextCursor: null }),
  );
  render(<TutorialsPage />);
  expect(await screen.findByText('React 性能优化')).toBeInTheDocument();
  expect(screen.getByText('部分完成')).toBeInTheDocument();
  expect(screen.getByText('章节 2/3 完成，1 章失败')).toBeInTheDocument();
  expect(screen.getByText('React 性能优化').closest('a')).toHaveAttribute(
    'href',
    '/tutorials/tut-1',
  );
});

/** 用于验证空列表展示空态文案。 */
test('空列表展示空态提示', async () => {
  stubListFetch((url) =>
    url.includes('/api/v1/tutorials')
      ? jsonResponse([])
      : jsonResponse({ items: [], nextCursor: null }),
  );
  render(<TutorialsPage />);
  expect(await screen.findByText('还没有教程，先用上方表单创建一个。')).toBeInTheDocument();
});

/** 用于验证创建教程提交载荷并刷新列表。 */
test('创建教程提交并刷新列表', async () => {
  const fetchMock = vi.fn((input: string | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/v1/tutorials' && init?.method === 'POST') {
      return Promise.resolve(jsonResponse({ id: 'tut-new', status: 'draft' }, 201));
    }
    if (url.includes('/api/v1/tutorials')) {
      return Promise.resolve(
        jsonResponse([
          {
            chapterCounts: null,
            createdAt: '2026-09-03T08:00:00.000Z',
            id: 'tut-new',
            status: 'draft',
            topic: 'Rust 入门',
          },
        ]),
      );
    }
    return Promise.resolve(jsonResponse({ items: [], nextCursor: null }));
  });
  vi.stubGlobal('fetch', fetchMock);
  render(<TutorialsPage />);
  fireEvent.change(await screen.findByLabelText('主题'), {
    target: { value: 'Rust 入门' },
  });
  fireEvent.change(screen.getByLabelText('受众'), { target: { value: '初学者' } });
  fireEvent.click(screen.getByRole('button', { name: '概览' }));
  fireEvent.click(screen.getByRole('button', { name: '创建教程' }));
  await waitFor(() => expect(screen.findByText('Rust 入门')).resolves.toBeInTheDocument());
  const createCall = fetchMock.mock.calls.find(
    (call) => String(call[0]) === '/api/v1/tutorials' && call[1]?.method === 'POST',
  );
  const body = createCall === undefined ? '{}' : String(createCall[1]?.body as string | undefined);
  const payload: unknown = JSON.parse(body);
  expect(payload).toMatchObject({
    audience: '初学者',
    depth: 'overview',
    topic: 'Rust 入门',
  });
  expect(lastCallUrl(fetchMock)).toContain('/api/v1/tutorials');
});
