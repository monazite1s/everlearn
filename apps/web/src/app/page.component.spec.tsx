/** @fileoverview Verifies the initial workspace page heading and information hierarchy. */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import HomePage from './page';

afterEach(cleanup);

/** Confirms the home route exposes one focusable page title and stable workspace region. */
function rendersWorkspaceEntry(): void {
  render(<HomePage />);

  const heading = screen.getByRole('heading', { level: 1, name: '首页' });
  expect(heading).toHaveAttribute('data-page-title');
  expect(heading).toHaveAttribute('tabindex', '-1');
  expect(screen.getByRole('heading', { level: 2, name: '工作区已就绪' })).toBeVisible();
}

test('renders the workspace entry', rendersWorkspaceEntry);
