/** @fileoverview 验证简报 tab 的结构化空态、失败重试与知识库路由来源。 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { NewsDigestsTab } from './news-digests-tab';

/** 用于返回组件请求适配器可读取的最小响应。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于读取确定测试载荷。 */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** 用于按调用序分派简报列表响应。 */
function stubDigestResponses(responses: unknown[]): void {
  let call = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn((): Promise<Response> =>
      Promise.resolve(jsonResponse(responses[call++] ?? { items: [], nextCursor: null })),
    ),
  );
}

/** 用于构造一条简报投影。 */
function digest(overrides: Record<string, unknown> = {}): unknown {
  return {
    digestDate: '2026-09-04',
    documentId: 'doc-9',
    id: 'digest-9',
    itemCount: 3,
    knowledgeBaseId: 'kb-from-digest',
    status: 'succeeded',
    title: '简报标题',
    warningCount: 0,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 用于验证没有任何简报时展示结构化空态而不伪造占位。 */
test('empty digests render structured empty state', async () => {
  stubDigestResponses([{ items: [], nextCursor: null }]);
  render(<NewsDigestsTab active online fallbackKnowledgeBaseId={null} />);

  expect(await screen.findByText('还没有简报')).toBeVisible();
  expect(screen.getByText(/简报由订阅按计划聚合条目生成/)).toBeVisible();
});

/** 用于验证简报读取失败提供就地重试。 */
test('digests failure offers retry', async () => {
  stubDigestResponses([
    { code: 'INTERNAL_ERROR', message: '服务暂时不可用', requestId: 'r3' },
    { items: [digest()], nextCursor: null },
  ]);
  render(<NewsDigestsTab active online fallbackKnowledgeBaseId={null} />);

  expect(await screen.findByText('无法读取简报')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
  expect(await screen.findByRole('heading', { name: '简报标题' })).toBeVisible();
});

/** 用于验证文档路由优先使用简报自带的知识库标识。 */
test('digest rows link with digest-provided knowledge base', async () => {
  stubDigestResponses([
    {
      items: [
        digest({ documentId: null, id: 'digest-run', status: 'running', title: '生成中的简报' }),
        digest(),
      ],
      nextCursor: null,
    },
  ]);
  render(<NewsDigestsTab active online fallbackKnowledgeBaseId="kb-fallback" />);

  expect(await screen.findByRole('link', { name: /简报标题/ })).toHaveAttribute(
    'href',
    '/knowledge/kb-from-digest/documents/doc-9',
  );
  expect(screen.getAllByText('生成中').length).toBe(1);
  expect(screen.queryByRole('link', { name: /生成中的简报/ })).toBeNull();
});

/** 用于验证置顶卡优先挑选已生成文档且聚合条目最多的简报。 */
test('featured card prefers ready digest with the most items', async () => {
  stubDigestResponses([
    {
      items: [
        digest({
          documentId: null,
          id: 'digest-run',
          itemCount: 9,
          status: 'running',
          title: '生成中的简报',
        }),
        digest({ id: 'digest-small', itemCount: 3, title: '条目较少的简报' }),
        digest({
          digestDate: '2026-09-03',
          id: 'digest-large',
          itemCount: 9,
          title: '条目最多的简报',
        }),
      ],
      nextCursor: null,
    },
  ]);
  render(<NewsDigestsTab active online fallbackKnowledgeBaseId={null} />);

  expect(await screen.findByRole('heading', { name: '条目最多的简报' })).toBeVisible();
  expect(screen.getByText('聚合 9 条资讯条目')).toBeVisible();
  expect(screen.queryByRole('heading', { name: '生成中的简报' })).toBeNull();
});
