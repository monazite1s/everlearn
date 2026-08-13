/** @fileoverview Verifies the root route renders the knowledge-first home composition. */

import { cleanup, render, screen } from '@testing-library/react';
import { EverlearnUiProvider } from '@everlearn/ui';
import { afterEach, expect, test, vi } from 'vitest';

import HomePage from './page';

/** Restores DOM and request state after the route scenario. */
function resetRoute(): void {
  cleanup();
  vi.unstubAllGlobals();
}

afterEach(resetRoute);

/** Confirms the root route exposes its title and primary knowledge area. */
function rendersWorkspaceEntry(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockReturnValue(
      new Promise(
        /** Keeps the route in its honest loading state for this structural assertion. */
        () => undefined,
      ),
    ),
  );
  render(
    <EverlearnUiProvider colorMode="light">
      <HomePage />
    </EverlearnUiProvider>,
  );

  const heading = screen.getByRole('heading', { level: 1, name: '首页' });
  expect(heading).toHaveAttribute('data-page-title');
  expect(heading).toHaveAttribute('tabindex', '-1');
  expect(screen.getByRole('heading', { level: 2, name: '继续学习' })).toBeVisible();
  expect(screen.getByRole('heading', { level: 2, name: '知识库' })).toBeVisible();
}

test('renders the workspace entry', rendersWorkspaceEntry);
