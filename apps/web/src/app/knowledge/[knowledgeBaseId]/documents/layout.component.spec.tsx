/** @fileoverview 验证文档区共享布局的树高亮与跨文档切换持久性。 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import DocumentsLayout from './layout';

const DOC_A = '11111111-1111-4111-8111-111111111111';
const DOC_B = '99999999-9999-4999-8999-999999999999';
const KB_ID = '22222222-2222-4222-8222-222222222222';
const fetchMock = vi.fn();
const pathnameMock = vi.fn<() => string>();

vi.mock('next/navigation', () => ({
  /** 用于按用例控制当前路径。 */
  usePathname: (): string => pathnameMock(),
  /** 用于提供布局段参数。 */
  useParams: (): { knowledgeBaseId: string } => ({ knowledgeBaseId: KB_ID }),
}));

/** 用于构造最小文档列表响应。 */
function treeList() {
  return {
    items: [
      { childCount: 0, id: DOC_A, title: '文档甲', updatedAt: '2026-08-18T08:00:00Z', version: 1 },
      { childCount: 0, id: DOC_B, title: '文档乙', updatedAt: '2026-08-18T08:00:00Z', version: 1 },
    ],
    nextCursor: null,
  };
}

/** 用于以文档列表成功响应应答任意请求。 */
function respondTreeList(): Promise<Response> {
  return Promise.resolve({
    json: /** 用于返回文档列表载荷。 */ () => Promise.resolve(treeList()),
    status: 200,
  } as Response);
}

beforeEach(() => {
  pathnameMock.mockReturnValue(`/knowledge/${KB_ID}/documents/${DOC_A}`);
  fetchMock.mockImplementation(respondTreeList);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

test('按路径高亮当前文档并指向文档路由', async () => {
  render(
    <DocumentsLayout>
      <div>内容插槽</div>
    </DocumentsLayout>,
  );
  const aside = screen.getByRole('complementary', { name: '文档树' });
  await waitFor(() => {
    const anchor = Array.from(aside.querySelectorAll('a')).find((a) =>
      a.getAttribute('href')?.endsWith(DOC_A),
    );
    expect(anchor).toBeDefined();
    expect(anchor).toHaveAttribute('aria-current', 'page');
  });
  expect(aside.querySelector(`a[href*="${DOC_B}"]`)).not.toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('内容插槽')).toBeVisible();
});

test('切换文档仅更新高亮，不重挂树或重取列表', async () => {
  const { rerender } = render(
    <DocumentsLayout>
      <div>内容甲</div>
    </DocumentsLayout>,
  );
  await waitFor(() => expect(screen.getByText('文档乙')).toBeVisible());
  const callsAfterMount = fetchMock.mock.calls.length;
  pathnameMock.mockReturnValue(`/knowledge/${KB_ID}/documents/${DOC_B}`);
  rerender(
    <DocumentsLayout>
      <div>内容乙</div>
    </DocumentsLayout>,
  );
  expect(screen.getByText('内容乙')).toBeVisible();
  expect(screen.queryByText('内容甲')).not.toBeInTheDocument();
  await waitFor(() => {
    const anchor = document.querySelector(`a[href*="${DOC_B}"]`);
    expect(anchor).toHaveAttribute('aria-current', 'page');
  });
  expect(fetchMock.mock.calls.length).toBe(callsAfterMount);
});
