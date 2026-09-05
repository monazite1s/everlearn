/** @fileoverview 验证订阅菜单桌面全功能与移动端只读状态展示。 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { useIsMobile } from '@everlearn/ui';

import { NewsSubscriptionMenu } from './news-subscription-menu';
import type { NewsSubscription } from './news-subscriptions-api';

vi.mock('@everlearn/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useIsMobile: vi.fn(() => false) };
});

/** 用于构造一条订阅投影。 */
function subscription(): NewsSubscription {
  return {
    colorSlot: 2,
    enabled: true,
    excludeKeywords: [],
    id: '11111111-1111-4111-8111-111111111111',
    includeKeywords: [],
    name: 'AI 前沿',
    newsKnowledgeBaseId: 'kb-1',
    nextRunAt: null,
    schedule: { kind: 'daily', time: '08:00', timezone: 'Asia/Shanghai', weekday: null },
    sources: [{ type: 'rss', value: 'https://example.com/feed.xml' }],
    topic: '大模型',
    version: 3,
  };
}

/** 用于渲染订阅菜单并打开下拉。 */
async function renderOpenMenu(): Promise<void> {
  render(
    <NewsSubscriptionMenu
      onCreate={vi.fn()}
      onEdit={vi.fn()}
      onRun={vi.fn()}
      onToggle={vi.fn()}
      pending={false}
      subscriptions={[subscription()]}
    />,
  );
  const trigger = screen.getByRole('button', { name: '订阅' });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.click(trigger);
  await screen.findByRole('menu');
}

beforeEach(() => {
  vi.mocked(useIsMobile).mockReturnValue(false);
});

afterEach(() => {
  cleanup();
});

/** 用于验证桌面端菜单提供新建与逐订阅编辑、运行、启停操作。 */
test('desktop menu offers full subscription actions', async () => {
  await renderOpenMenu();

  expect(screen.getByText('AI 前沿')).toBeVisible();
  expect(screen.getByText(/每日 08:00/)).toBeVisible();
  expect(screen.getByRole('menuitem', { name: '新建订阅' })).toBeVisible();
  expect(screen.getByRole('menuitem', { name: '编辑' })).toBeVisible();
  expect(screen.getByRole('menuitem', { name: '立即运行' })).toBeVisible();
  expect(screen.getByRole('menuitem', { name: '停用' })).toBeVisible();
});

/** 用于验证移动端菜单保留入口但只展示订阅状态，不渲染操作项。 */
test('mobile menu keeps entry and shows status without actions', async () => {
  vi.mocked(useIsMobile).mockReturnValue(true);
  await renderOpenMenu();

  expect(screen.getByText('AI 前沿')).toBeVisible();
  expect(screen.getByText(/每日 08:00/)).toBeVisible();
  expect(screen.queryByRole('menuitem')).toBeNull();
});
