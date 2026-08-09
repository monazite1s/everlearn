/**
 * @fileoverview Verifies the temporary engineering page through accessible DOM semantics.
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import HomePage from './page';

afterEach(cleanup);

/** Confirms the foundation page exposes one descriptive primary heading. */
function rendersFoundationHeading(): void {
  render(<HomePage />);

  expect(screen.getByRole('heading', { level: 1, name: 'Everlearn 工程基线' })).toBeVisible();
  expect(screen.getByText(/知识库、资讯、教程与工作流/u)).toBeVisible();
}

test('renders the foundation heading and scope', rendersFoundationHeading);
