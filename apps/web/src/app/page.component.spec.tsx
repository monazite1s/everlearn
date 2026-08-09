/** @fileoverview Verifies the root route renders the knowledge-first home composition. */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import HomePage from './page';

afterEach(cleanup);

/** Confirms the root route exposes its title and primary knowledge area. */
function rendersWorkspaceEntry(): void {
  render(<HomePage />);

  const heading = screen.getByRole('heading', { level: 1, name: '首页' });
  expect(heading).toHaveAttribute('data-page-title');
  expect(heading).toHaveAttribute('tabindex', '-1');
  expect(screen.getByRole('heading', { level: 2, name: '继续学习' })).toBeVisible();
  expect(screen.getByRole('heading', { level: 2, name: '知识库' })).toBeVisible();
}

test('renders the workspace entry', rendersWorkspaceEntry);
