/** @fileoverview 验证首页真实知识库数据的加载、空态和恢复行为。 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { KnowledgeBaseSummary } from '@everlearn/contracts';
import { afterEach, expect, test, vi } from 'vitest';

import { HomePage } from './home-page';

/** 用于构造真实响应边界所需的严格公开知识库摘要。 */
function summary(): KnowledgeBaseSummary {
  return {
    description: '沉淀本项目的架构决策与学习笔记。',
    documentCount: 0,
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'normal',
    name: 'Everlearn 开发记录',
    updatedAt: '2026-08-13T08:00:00.000000Z',
    version: 1,
  };
}

/** 用于返回共享 API 适配器所需的最小响应接口。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于返回无需传输解析的确定正文。 */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** 用于在标准 UI Provider 中渲染生产首页。 */
function renderHome(): void {
  render(<HomePage />);
}

/** 用于在测试中模拟桌面或移动视口。 */
function stubViewport(desktop: boolean): void {
  window.matchMedia = vi.fn().mockReturnValue({
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches: desktop,
    media: '(min-width: 48rem)',
    onchange: null,
    removeEventListener: vi.fn(),
  });
}

/** 用于在每个场景后恢复 DOM、网络和请求状态。 */
function resetScenario(): void {
  cleanup();
  stubViewport(false);
  vi.unstubAllGlobals();
}

afterEach(resetScenario);

/** 用于验证生产页面只渲染真实知识库数据。 */
async function rendersRealKnowledge(): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse({ items: [summary()], nextCursor: null })),
  );
  renderHome();

  expect(await screen.findByText('Everlearn 开发记录')).toBeVisible();
  expect(screen.getByText('最近打开记录将在文档阅读能力接入后显示。')).toBeVisible();
  expect(screen.getByText('当前账号下的知识库总数')).toBeVisible();
  expect(screen.getByText('各知识库文档数量之和')).toBeVisible();
  expect(screen.getByText('最近一次内容更新时间')).toBeVisible();
  expect(screen.getByText('1')).toBeVisible();
  expect(screen.queryByRole('heading', { name: '进行中' })).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: '内容' })).not.toBeInTheDocument();
}

/** 用于验证首次使用入口指向统一创建流程。 */
async function rendersFirstUse(): Promise<void> {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ items: [], nextCursor: null })));
  renderHome();

  const action = await screen.findByRole('link', { name: '创建第一个知识库' });
  expect(action).toHaveAttribute('href', '/knowledge?create=knowledge-base');
}

/** 用于验证首次读取失败可在保留页面框架时恢复。 */
async function retriesKnowledgeFailure(): Promise<void> {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ code: 'INTERNAL_ERROR', message: '服务暂不可用。' }, 500))
    .mockResolvedValueOnce(jsonResponse({ items: [summary()], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock);
  renderHome();

  expect(await screen.findByText('服务暂不可用。')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '重新读取' }));
  expect(await screen.findByText('Everlearn 开发记录')).toBeVisible();
  expect(fetchMock).toHaveBeenCalledTimes(2);
}

/** 用于验证快速记录只在桌面渲染且移动端不渲染输入。 */
async function rendersQuickCaptureOnDesktopOnly(): Promise<void> {
  const emptyList = jsonResponse({ items: [], nextCursor: null });
  stubViewport(true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyList));
  renderHome();

  expect(await screen.findByRole('heading', { name: '快速记录' })).toBeVisible();
  expect(screen.getByRole('textbox', { name: '内容' })).toBeVisible();

  cleanup();
  stubViewport(false);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(emptyList));
  renderHome();

  await screen.findByRole('heading', { name: '知识库' });
  expect(screen.queryByRole('heading', { name: '快速记录' })).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: '内容' })).not.toBeInTheDocument();
}

test('renders real knowledge without production fixtures', rendersRealKnowledge);
test('renders the canonical first-use creation entry', rendersFirstUse);
test('retries a failed home knowledge read', retriesKnowledgeFailure);
test('renders quick capture on desktop only', rendersQuickCaptureOnDesktopOnly);
