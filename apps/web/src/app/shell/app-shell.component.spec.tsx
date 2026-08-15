/** @fileoverview 验证官方 dashboard 骨架应用壳的桌面与移动端结构。 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';

import { AppShell } from './app-shell';
import { ThemeProvider } from '../theme-provider';

let mockPathname = '/knowledge';

/** 用于返回应用壳组件测试的稳定路径。 */
function useMockPathname(): string {
  return mockPathname;
}

/** 用于提供应用壳所需的最小 App Router 接口。 */
function createNavigationMock(): { usePathname: typeof useMockPathname } {
  return { usePathname: useMockPathname };
}

vi.mock('next/navigation', createNavigationMock);

/** 用于返回 jsdom 缺失的指针捕获状态。 */
function stubHasPointerCapture(): boolean {
  return false;
}

/** 用于吸收 jsdom 缺失的指针与滚动接口调用。 */
function stubPointerApi(): void {
  // ponytail: 组件测试桩，无行为需要模拟。
}

beforeAll(
  /** 用于补齐 Radix 菜单依赖而 jsdom 缺失的指针与滚动接口。 */
  function stubPointerApis(): void {
    Element.prototype.hasPointerCapture = stubHasPointerCapture;
    Element.prototype.releasePointerCapture = stubPointerApi;
    Element.prototype.scrollIntoView = stubPointerApi;
  },
);

/** 用于在每个应用壳场景后清理 DOM 和浏览器持久化。 */
function resetShell(): void {
  cleanup();
  localStorage.clear();
  mockPathname = '/knowledge';
  document.documentElement.classList.remove('dark');
  window.innerWidth = 1024;
}

afterEach(resetShell);

/** 用于以稳定知识库页面渲染应用壳。 */
function renderShell(): void {
  render(
    <ThemeProvider>
      <AppShell>
        <h1 data-page-title tabIndex={-1}>
          知识库
        </h1>
      </AppShell>
    </ThemeProvider>,
  );
}

/** 用于按目标地址在同名链接中定位侧栏导航项。 */
function findNavLink(name: string, href: string): HTMLElement {
  const candidate = screen
    .getAllByRole('link', { name })
    .find((link) => link.getAttribute('href') === href);
  if (!candidate) throw new Error(`Navigation link ${name} -> ${href} is missing.`);
  return candidate;
}

/** 用于以指针事件打开外观菜单并返回菜单容器。 */
async function openAppearanceMenu(): Promise<HTMLElement> {
  const trigger = screen.getByRole('button', { name: '外观设置' });
  fireEvent.pointerDown(trigger, { button: 0 });
  return await screen.findByRole('menu');
}

/** 用于验证桌面侧栏、面包屑、外观菜单和折叠持久化保持可用。 */
async function rendersDesktopShell(): Promise<void> {
  renderShell();

  const knowledgeLink = findNavLink('知识库', '/knowledge');
  expect(knowledgeLink).toHaveAttribute('aria-current', 'page');
  expect(knowledgeLink.querySelector('svg')).not.toBeNull();
  expect(findNavLink('首页', '/').querySelector('svg')).not.toBeNull();

  const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' });
  expect(breadcrumb).toHaveTextContent('首页');
  expect(breadcrumb).toHaveTextContent('知识库');
  expect(screen.getByRole('link', { name: '跳到主要内容' })).toHaveAttribute(
    'href',
    '#main-content',
  );
  expect(document.getElementById('main-content')?.tagName).toBe('MAIN');
  await waitFor(
    /** 用于验证应用壳挂载后焦点跟随路由内容。 */
    () => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus(),
  );

  const menu = await openAppearanceMenu();
  for (const option of ['跟随系统', '浅色', '深色']) {
    expect(within(menu).getByRole('menuitemradio', { name: option })).toBeInTheDocument();
  }
  fireEvent.click(within(menu).getByRole('menuitemradio', { name: '深色' }));
  await waitFor(
    /** 用于验证选择深色后根节点 dark class 与持久化同步更新。 */
    () => {
      expect(document.documentElement.classList.contains('dark')).toBe(true);
      expect(localStorage.getItem('everlearn-theme')).toBe('dark');
    },
  );

  const sidebar = document.querySelector('div[data-slot="sidebar"]');
  expect(sidebar).toHaveAttribute('data-state', 'expanded');
  fireEvent.click(screen.getByRole('button', { name: '切换导航' }));
  await waitFor(
    /** 用于验证折叠状态写入持久化并反映到侧栏 data-state。 */
    () => {
      expect(localStorage.getItem('everlearn-left-panel-collapsed')).toBe('true');
      expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    },
  );
}

/** 用于验证移动端侧栏 Sheet 与导航入口。 */
async function rendersMobileReadingControls(): Promise<void> {
  window.innerWidth = 375;
  mockPathname = '/tutorials';
  renderShell();
  await waitFor(
    /** 用于等待路由焦点稳定后再模拟用户交互。 */
    () => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus(),
  );

  const menuTrigger = screen.getByRole('button', { name: '切换导航' });
  fireEvent.click(menuTrigger);
  const drawer = await screen.findByRole('dialog');
  expect(within(drawer).getByText('资讯')).toBeInTheDocument();
  expect(within(drawer).getByRole('link', { name: '设置' })).toHaveAttribute('href', '/settings');
  fireEvent.keyDown(document.body, { key: 'Escape' });
  await waitFor(
    /** 用于验证移动端侧栏可重新收起。 */
    () => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  );
}

/** 用于验证嵌套路由保留一级入口、面包屑只显示已知分段。 */
function rendersNestedRoutePolicy(): void {
  mockPathname = '/knowledge/library-1/documents/document-1';
  renderShell();

  expect(findNavLink('知识库', '/knowledge')).toHaveAttribute('aria-current', 'page');
  const breadcrumb = screen.getByRole('navigation', { name: 'breadcrumb' });
  expect(breadcrumb).toHaveTextContent('知识库');
  expect(breadcrumb).not.toHaveTextContent('library-1');
}

test('renders the accessible desktop shell', rendersDesktopShell);
test('renders mobile reading controls', rendersMobileReadingControls);
test('keeps nested routes inside their primary destination', rendersNestedRoutePolicy);
