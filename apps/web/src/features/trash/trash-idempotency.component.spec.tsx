/** @fileoverview 验证恢复操作的幂等键在取消重开与重试之间的生命周期。 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { TrashItem } from '@everlearn/contracts';
import { afterEach, expect, test, vi } from 'vitest';

import { TrashPage } from './trash-page';

const NOTICE = '移动端保留阅读、搜索和运行状态，暂不提供内容创作。';

/** 用于构造 API 组件场景使用的严格回收站条目。 */
function trashItem(): TrashItem {
  return {
    deletedAt: '2026-08-17T08:00:00.000000Z',
    id: '22222222-2222-4222-8222-222222222222',
    knowledgeBaseId: '11111111-1111-4111-8111-111111111111',
    knowledgeBaseName: 'Agent 工程',
    objectType: 'document',
    purgeScheduledAt: '2026-09-16T08:00:00.000000Z',
    title: '恢复策略笔记',
    version: 3,
  };
}

/** 用于返回文档恢复端点确认的严格详情。 */
function documentDetail(): object {
  return {
    childCount: 1,
    id: '22222222-2222-4222-8222-222222222222',
    knowledgeBaseId: '11111111-1111-4111-8111-111111111111',
    parentId: null,
    title: '恢复策略笔记',
    updatedAt: '2026-08-17T08:00:00.000000Z',
    version: 4,
  };
}

/** 用于返回页面适配器所需的最小 Fetch 响应。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于返回无需传输解析的确定正文。 */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** 用于读取第 index 次调用中恢复请求的幂等键头。 */
function restoreKeyOf(fetchMock: ReturnType<typeof vi.fn>, index: number): string {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.['Idempotency-Key'] ?? '';
}

/** 用于以桌面视口渲染回收站页面。 */
function renderDesktop(): void {
  window.matchMedia = vi.fn().mockReturnValue({
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: true,
    media: '(min-width: 48.0625em)',
    onchange: null,
    removeEventListener: vi.fn(),
  });
  render(<TrashPage mobileNotice={NOTICE} />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** 用于验证取消丢弃幂等键后重开使用新键。 */
test('issues a new idempotency key after cancel and reopen', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [trashItem()], nextCursor: null }))
    .mockRejectedValueOnce(new TypeError('network unavailable'))
    .mockResolvedValueOnce(jsonResponse({ items: [trashItem()], nextCursor: null }))
    .mockResolvedValueOnce(jsonResponse(documentDetail()))
    .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock);
  renderDesktop();

  expect(await screen.findByText('恢复策略笔记')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '恢复“恢复策略笔记”' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认恢复' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  const firstKey = restoreKeyOf(fetchMock, 1);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: '恢复“恢复策略笔记”' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认恢复' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(5));
  expect(restoreKeyOf(fetchMock, 3)).not.toBe(firstKey);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
