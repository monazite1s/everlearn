/** @fileoverview Verifies real knowledge listing, creation, recovery, and destination reads. */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { EverlearnUiProvider } from '@everlearn/ui';
import type { KnowledgeBaseSummary } from '@everlearn/contracts';
import type { ReactElement } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

import { KnowledgeDestination } from './knowledge-destination';
import { KnowledgePage } from './knowledge-page';

const routerPush = vi.fn();
let mockSearch = '';

/** Returns the narrow router surface used after a confirmed creation. */
function useMockRouter() {
  return { push: routerPush };
}

/** Returns deterministic page query parameters for creation-entry tests. */
function useMockSearchParams(): URLSearchParams {
  return new URLSearchParams(mockSearch);
}

/** Provides only the App Router functions consumed by this feature. */
function createNavigationMock() {
  return { useRouter: useMockRouter, useSearchParams: useMockSearchParams };
}

vi.mock('next/navigation', createNavigationMock);

/** Builds one exact public summary used by API-backed component scenarios. */
function summary(overrides: Partial<KnowledgeBaseSummary> = {}): KnowledgeBaseSummary {
  return {
    description: '围绕 Agent 工程的长期学习资料。',
    documentCount: 2,
    id: '11111111-1111-4111-8111-111111111111',
    kind: 'normal',
    name: 'Agent 工程',
    updatedAt: '2026-08-13T08:00:00.000000Z',
    version: 1,
    ...overrides,
  };
}

/** Returns the minimal fetch response surface consumed by the page adapter. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** Resolves the deterministic response payload without transport parsing. */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** Renders one feature component inside the production UI provider. */
function renderKnowledge(element: ReactElement): void {
  render(<EverlearnUiProvider colorMode="light">{element}</EverlearnUiProvider>);
}

/** Restores DOM, navigation, query, and global request state after each scenario. */
function resetScenario(): void {
  cleanup();
  mockSearch = '';
  routerPush.mockReset();
  vi.unstubAllGlobals();
}

afterEach(resetScenario);

/** Confirms an empty persisted list can create and enter a server-confirmed destination. */
async function createsFirstKnowledgeBase(): Promise<void> {
  const created = summary({ documentCount: 0 });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }))
    .mockResolvedValueOnce(jsonResponse(created, 201));
  vi.stubGlobal('fetch', fetchMock);
  renderKnowledge(<KnowledgePage />);

  await screen.findByText('建立你的第一个知识库');
  fireEvent.click(screen.getByRole('button', { name: '新建知识库' }));
  const nameInput = await screen.findByRole('textbox', { name: '名称' });
  fireEvent.change(nameInput, {
    target: { value: ' Agent 工程 ' },
  });
  fireEvent.click(screen.getByRole('button', { name: '创建并进入' }));

  await waitFor(() => expect(routerPush).toHaveBeenCalledWith(`/knowledge/${created.id}`));
  const request = fetchMock.mock.calls[1]?.[1] as RequestInit | undefined;
  expect(request?.method).toBe('POST');
  expect(request?.body).toBe(JSON.stringify({ name: 'Agent 工程' }));
  expect(typeof request?.body === 'string' ? request.body : '').not.toContain('ownerId');
}

/** Confirms uncertain creation re-reads the list once and never replays the POST. */
async function recoversUnknownCreateResult(): Promise<void> {
  const persisted = summary({ name: '网络恢复后的知识库' });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [], nextCursor: null }))
    .mockRejectedValueOnce(new Error('connection closed'))
    .mockResolvedValueOnce(jsonResponse({ items: [persisted], nextCursor: null }));
  vi.stubGlobal('fetch', fetchMock);
  renderKnowledge(<KnowledgePage />);

  await screen.findByText('建立你的第一个知识库');
  fireEvent.click(screen.getByRole('button', { name: '新建知识库' }));
  const nameInput = await screen.findByRole('textbox', { name: '名称' });
  fireEvent.change(nameInput, {
    target: { value: '网络恢复后的知识库' },
  });
  fireEvent.click(screen.getByRole('button', { name: '创建并进入' }));

  expect(await screen.findByText('网络恢复后的知识库')).toBeVisible();
  expect(screen.getByRole('textbox', { name: '名称' })).toHaveValue('网络恢复后的知识库');
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect((fetchMock.mock.calls[2]?.[1] as RequestInit | undefined)?.method).toBeUndefined();
  expect(routerPush).not.toHaveBeenCalled();
}

/** Confirms a later cursor failure retains prior items and exposes a local retry. */
async function retainsItemsAfterPaginationFailure(): Promise<void> {
  const first = summary();
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(jsonResponse({ items: [first], nextCursor: 'next-page' }))
    .mockResolvedValueOnce(
      jsonResponse({ code: 'INTERNAL_ERROR', message: '服务暂不可用。', requestId: 'r1' }, 500),
    );
  vi.stubGlobal('fetch', fetchMock);
  renderKnowledge(<KnowledgePage />);

  expect(await screen.findByText('Agent 工程')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '加载更多' }));
  expect(await screen.findByText('服务暂不可用。')).toBeVisible();
  expect(screen.getByText('Agent 工程')).toBeVisible();
  expect(screen.getByRole('button', { name: '重新读取' })).toBeVisible();
}

/** Confirms the post-create route reads a persisted summary on every mount. */
async function readsPersistedDestination(): Promise<void> {
  const persisted = summary({ documentCount: 0 });
  const fetchMock = vi.fn().mockImplementation(
    /** Returns a fresh response object for each route mount. */
    () => Promise.resolve(jsonResponse(persisted)),
  );
  vi.stubGlobal('fetch', fetchMock);

  const first = render(
    <EverlearnUiProvider colorMode="light">
      <KnowledgeDestination knowledgeBaseId={persisted.id} />
    </EverlearnUiProvider>,
  );
  expect(await screen.findByRole('heading', { level: 1, name: persisted.name })).toBeVisible();
  first.unmount();
  fetchMock.mockClear();
  renderKnowledge(<KnowledgeDestination knowledgeBaseId={persisted.id} />);
  await screen.findByText('0 篇文档');
  expect(fetchMock).toHaveBeenCalledOnce();
}

test('creates the first persisted knowledge base', createsFirstKnowledgeBase);
test('recovers an unknown create result without replaying POST', recoversUnknownCreateResult);
test('retains prior items after pagination failure', retainsItemsAfterPaginationFailure);
test('reads the persisted post-create destination on refresh', readsPersistedDestination);
