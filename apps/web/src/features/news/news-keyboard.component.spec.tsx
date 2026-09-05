/** @fileoverview 验证条目流 j/k roving 焦点、Enter 打开详情与 Escape 逐层关闭。 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { NewsPage } from './news-page';

const routerBack = vi.fn();
const routerPush = vi.fn();
const routerReplace = vi.fn();

/** 用于提供资讯页 URL 同步所需的最小 App Router。 */
function createNavigationMock() {
  return {
    /** 用于返回只含 replace/push/back 的测试路由。 */
    useRouter: () => ({ back: routerBack, push: routerPush, replace: routerReplace }),
  };
}

vi.mock('next/navigation', createNavigationMock);

const ITEM_A = '22222222-2222-4222-8222-222222222222';
const ITEM_B = '33333333-3333-4333-8333-333333333333';
const ITEM_C = '44444444-4444-4444-8444-444444444444';

/** 用于返回组件请求适配器可读取的最小响应。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于读取确定测试载荷。 */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** 用于构造一条条目流投影。 */
function item(id: string, title: string): unknown {
  return {
    colorSlot: 1,
    discoveredAt: new Date().toISOString(),
    id,
    importance: 'normal',
    snippet: '摘要',
    sourceType: 'rss',
    subscriptionId: 'sub-1',
    title,
    topic: '大模型',
    url: 'https://example.com/a',
  };
}

/** 用于渲染三条条目并等待就绪。 */
async function renderThreeItems(initialSearchParams = ''): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: unknown): Promise<Response> => {
      const url = String(input);
      if (url.startsWith('/api/v1/news-items'))
        return Promise.resolve(
          jsonResponse({
            items: [item(ITEM_A, '条目甲'), item(ITEM_B, '条目乙'), item(ITEM_C, '条目丙')],
            nextCursor: null,
          }),
        );
      return Promise.resolve(jsonResponse([]));
    }),
  );
  render(<NewsPage initialSearchParams={initialSearchParams} />);
  await screen.findByText('条目甲');
}

/** 用于按 data 属性取行内主链接。 */
function rowLink(title: string): HTMLAnchorElement {
  return screen.getByText(title).closest('a')!;
}

/** 用于恢复每个场景修改的 DOM、导航和网络状态。 */
function resetScenario(): void {
  cleanup();
  vi.unstubAllGlobals();
  routerBack.mockReset();
  routerPush.mockReset();
  routerReplace.mockReset();
}

afterEach(resetScenario);

/** 用于验证 j/k 在行间移动 roving 焦点并标记 aria-current。 */
test('j and k move roving focus between rows', async () => {
  await renderThreeItems();

  fireEvent.keyDown(document.body, { key: 'j' });
  expect(rowLink('条目甲')).toHaveFocus();
  expect(rowLink('条目甲').closest('li')).toHaveAttribute('aria-current', 'true');
  expect(rowLink('条目甲')).toHaveAttribute('tabindex', '0');
  expect(rowLink('条目乙')).toHaveAttribute('tabindex', '-1');

  fireEvent.keyDown(document.body, { key: 'j' });
  expect(rowLink('条目乙')).toHaveFocus();
  expect(rowLink('条目乙').closest('li')).toHaveAttribute('aria-current', 'true');

  fireEvent.keyDown(document.body, { key: 'k' });
  expect(rowLink('条目甲')).toHaveFocus();
  expect(rowLink('条目甲').closest('li')).toHaveAttribute('aria-current', 'true');
});

/** 用于验证在活动行上 Enter 打开详情 Sheet 并 push 深链。 */
test('enter opens detail sheet from active row', async () => {
  await renderThreeItems();

  fireEvent.keyDown(document.body, { key: 'j' });
  fireEvent.keyDown(document.activeElement!, { key: 'Enter' });

  expect(await screen.findByRole('dialog')).toBeVisible();
  expect(routerPush).toHaveBeenCalledWith(`/news?item=${ITEM_A}`);
});

/** 用于验证 Escape 关闭 Sheet、回退历史并把焦点还给触发行。 */
test('escape closes sheet, backs history and restores focus', async () => {
  await renderThreeItems();
  const link = rowLink('条目甲');
  /** 浏览器点击链接会先聚焦，JSDOM 需手动补齐以验证焦点归还。 */
  link.focus();
  fireEvent.click(link);

  const dialog = await screen.findByRole('dialog');
  fireEvent.keyDown(dialog, { key: 'Escape' });

  expect(await screen.findByText('条目甲')).toBeVisible();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(routerBack).toHaveBeenCalledTimes(1);
  expect(link).toHaveFocus();
});

/** 用于验证焦点处于浮层或输入态时键盘流不拦截按键。 */
test('keyboard flow skips dialogs and composing keys', async () => {
  await renderThreeItems(`?item=${ITEM_A}`);
  const dialog = await screen.findByRole('dialog');

  fireEvent.keyDown(dialog, { key: 'j' });
  expect(rowLink('条目甲')).not.toHaveFocus();
  expect(rowLink('条目甲').closest('li')).not.toHaveAttribute('aria-current');

  const composing = new KeyboardEvent('keydown', { bubbles: true, key: 'j' });
  Object.defineProperty(composing, 'isComposing', { value: true });
  document.body.dispatchEvent(composing);
  expect(document.activeElement).not.toBe(rowLink('条目乙'));
});
