/** @fileoverview Verifies desktop navigation, panel controls, and route focus behavior. */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { AppShell } from './app-shell';
import { ThemeProvider } from './theme-provider';

/** Returns the stable pathname used by the shell component test. */
function useMockPathname(): string {
  return '/knowledge';
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
  sessionStorage.clear();
}

afterEach(resetShell);

/** Confirms route context, title focus, and persisted panel controls remain accessible. */
async function rendersDesktopShell(): Promise<void> {
  sessionStorage.setItem('everlearn-right-panel:/knowledge', 'true');
  render(
    <ThemeProvider>
      <AppShell>
        <h1 data-page-title tabIndex={-1}>
          知识库
        </h1>
      </AppShell>
    </ThemeProvider>,
  );

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

test('renders the accessible desktop shell', rendersDesktopShell);
