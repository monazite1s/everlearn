/** @fileoverview 验证桌面和移动端应用壳导航行为。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { AppShell } from './app-shell';
import { ThemeProvider } from './theme-provider';

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

/** 用于在每个应用壳场景后清理 DOM 和浏览器持久化。 */
function resetShell(): void {
  cleanup();
  localStorage.clear();
  mockPathname = '/knowledge';
  sessionStorage.clear();
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

/** 用于验证路由上下文、标题焦点和面板控件保持可访问。 */
async function rendersDesktopShell(): Promise<void> {
  sessionStorage.setItem('everlearn-right-panel:/knowledge', 'true');
  renderShell();

  expect(screen.getByRole('link', { name: '知识库' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: '知识库' }).querySelector('svg')).not.toBeNull();
  expect(screen.getByRole('banner').className).not.toBe('');
  expect(screen.getByRole('complementary', { name: '工作区导航' }).className).not.toBe('');
  await waitFor(
    /** 用于验证应用壳挂载后焦点跟随路由内容。 */
    () => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus(),
  );

  const leftToggle = screen.getByRole('button', { name: '收起导航' });
  fireEvent.click(leftToggle);
  expect(localStorage.getItem('everlearn-left-panel-collapsed')).toBe('true');
  expect(leftToggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('complementary', { name: '当前上下文' })).toBeVisible();
}

/** 用于验证移动抽屉提供导航并说明仅桌面创建限制。 */
async function rendersMobileReadingControls(): Promise<void> {
  mockPathname = '/tutorials';
  renderShell();
  await waitFor(
    /** 用于等待路由焦点稳定后再模拟用户交互。 */
    () => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus(),
  );

  const menuTrigger = screen.getByRole('button', { name: '打开导航' });
  menuTrigger.focus();
  fireEvent.click(menuTrigger);
  const drawer = await screen.findByRole('dialog', { name: '导航' });
  expect(drawer).toBeVisible();
  expect(drawer).toHaveTextContent('资讯');
  fireEvent.click(screen.getByRole('button', { name: '关闭导航' }));
  await waitFor(
    /** 用于验证 Mantine Drawer 将焦点恢复到移动端触发器。 */
    () => expect(menuTrigger).toHaveFocus(),
  );

  fireEvent.click(screen.getByRole('button', { name: '新建' }));
  expect(await screen.findByRole('dialog', { name: '请在桌面端创作' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '返回阅读' }));
  await waitFor(
    /** 用于等待 Mantine 退出过渡卸载对话框。 */
    () => expect(screen.queryByRole('dialog', { name: '请在桌面端创作' })).not.toBeInTheDocument(),
  );
}

/** 用于验证嵌套路由保留一级入口和移动端策略。 */
function rendersNestedRoutePolicy(): void {
  mockPathname = '/knowledge/library-1/documents/document-1';
  renderShell();

  expect(screen.getByRole('link', { name: '知识库' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: '新建' })).toHaveAttribute(
    'href',
    '/knowledge?create=knowledge-base',
  );
}

test('renders the accessible desktop shell', rendersDesktopShell);
test('renders mobile reading controls', rendersMobileReadingControls);
test('keeps nested routes inside their primary destination', rendersNestedRoutePolicy);
