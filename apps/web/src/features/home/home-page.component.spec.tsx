/** @fileoverview Verifies real home knowledge loading, empty, and recovery behavior. */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { KnowledgeBaseSummary } from '@everlearn/contracts';
import { EverlearnUiProvider } from '@everlearn/ui';
import { afterEach, expect, test, vi } from 'vitest';

import { HomePage } from './home-page';

/** Builds one exact public knowledge summary for the real response boundary. */
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

/** Returns the minimal response surface consumed by the shared API adapter. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** Resolves the deterministic body without transport parsing. */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** Renders the production home page inside its standard UI provider. */
function renderHome(): void {
  render(
    <EverlearnUiProvider colorMode="light">
      <HomePage />
    </EverlearnUiProvider>,
  );
}

/** Restores DOM, connectivity, and request state after each scenario. */
function resetScenario(): void {
  cleanup();
  vi.unstubAllGlobals();
}

afterEach(resetScenario);

/** Confirms production renders only real knowledge data and no inactive fixture regions. */
async function rendersRealKnowledge(): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(jsonResponse({ items: [summary()], nextCursor: null })),
  );
  renderHome();

  expect(await screen.findByText('Everlearn 开发记录')).toBeVisible();
  expect(screen.getByText('最近打开记录将在文档阅读能力接入后显示。')).toBeVisible();
  expect(screen.queryByRole('heading', { name: '进行中' })).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: '记录内容' })).not.toBeInTheDocument();
}

/** Confirms first use links to the canonical creation flow. */
async function rendersFirstUse(): Promise<void> {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ items: [], nextCursor: null })));
  renderHome();

  const action = await screen.findByRole('link', { name: '创建第一个知识库' });
  expect(action).toHaveAttribute('href', '/knowledge?create=knowledge-base');
}

/** Confirms a failed first read can recover without replacing the page frame. */
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

test('renders real knowledge without production fixtures', rendersRealKnowledge);
test('renders the canonical first-use creation entry', rendersFirstUse);
test('retries a failed home knowledge read', retriesKnowledgeFailure);
