/** @fileoverview Verifies desktop and mobile shell navigation behavior. */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { AppShell } from './app-shell';
import { ThemeProvider } from './theme-provider';

let mockPathname = '/knowledge';

/** Returns the stable pathname used by the shell component test. */
function useMockPathname(): string {
  return mockPathname;
}

/** Provides the narrow App Router surface consumed by the shell. */
function createNavigationMock(): { usePathname: typeof useMockPathname } {
  return { usePathname: useMockPathname };
}

vi.mock('next/navigation', createNavigationMock);

/** Clears shared DOM and browser persistence after each shell scenario. */
function resetShell(): void {
  cleanup();
  localStorage.clear();
  mockPathname = '/knowledge';
  sessionStorage.clear();
}

afterEach(resetShell);

/** Renders the shell with the stable knowledge page used by component scenarios. */
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

/** Confirms route context, title focus, and persisted panel controls remain accessible. */
async function rendersDesktopShell(): Promise<void> {
  sessionStorage.setItem('everlearn-right-panel:/knowledge', 'true');
  renderShell();

  expect(screen.getByRole('link', { name: '知识库' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('banner').className).not.toBe('');
  expect(screen.getByRole('complementary', { name: '工作区导航' }).className).not.toBe('');
  await waitFor(
    /** Verifies focus follows the route content after the shell mounts. */
    () => expect(screen.getByRole('heading', { level: 1 })).toHaveFocus(),
  );

  const leftToggle = screen.getByRole('button', { name: '收起' });
  fireEvent.click(leftToggle);
  expect(localStorage.getItem('everlearn-left-panel-collapsed')).toBe('true');
  expect(leftToggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('complementary', { name: '当前上下文' })).toBeVisible();
}

/** Confirms mobile drawers expose navigation and explain desktop-only creation. */
async function rendersMobileReadingControls(): Promise<void> {
  renderShell();

  const menuTrigger = screen.getByRole('button', { name: '打开导航' });
  fireEvent.click(menuTrigger);
  expect(screen.getByRole('dialog', { name: '导航' })).toBeVisible();
  expect(screen.getByRole('link', { name: '资讯' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '关闭对话框' }));
  await waitFor(
    /** Verifies the shared Dialog restores focus to the mobile trigger. */
    () => expect(menuTrigger).toHaveFocus(),
  );

  fireEvent.click(screen.getByRole('button', { name: '新建' }));
  expect(screen.getByRole('dialog', { name: '请在桌面端创作' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '返回阅读' }));
  expect(screen.queryByRole('dialog', { name: '请在桌面端创作' })).not.toBeInTheDocument();
}

/** Confirms nested routes retain their primary destination and mobile policy. */
function rendersNestedRoutePolicy(): void {
  mockPathname = '/knowledge/library-1/documents/document-1';
  renderShell();

  expect(screen.getByRole('link', { name: '知识库' })).toHaveAttribute('aria-current', 'page');
  fireEvent.click(screen.getByRole('button', { name: '新建' }));
  expect(screen.getByText('移动端保留阅读、搜索和运行状态，暂不提供内容创作。')).toBeVisible();
}

test('renders the accessible desktop shell', rendersDesktopShell);
test('renders mobile reading controls', rendersMobileReadingControls);
test('keeps nested routes inside their primary destination', rendersNestedRoutePolicy);
