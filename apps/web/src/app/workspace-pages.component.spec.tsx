/** @fileoverview Verifies every explicit workspace route owns a focusable module entry page. */

import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import type { ComponentType } from 'react';
import { afterEach, expect, test } from 'vitest';

import NewsPage from './news/page';
import SettingsPage from './settings/page';
import TutorialsPage from './tutorials/page';
import WorkflowsPage from './workflows/page';

interface ExplicitPageCase {
  component: ComponentType;
  title: string;
}

const explicitPages: readonly ExplicitPageCase[] = [
  { component: NewsPage, title: '资讯' },
  { component: TutorialsPage, title: '教程' },
  { component: WorkflowsPage, title: '工作流' },
  { component: SettingsPage, title: '设置' },
];

afterEach(cleanup);

/** Confirms each module boundary renders its own route title through the shared page frame. */
function rendersExplicitWorkspacePages(): void {
  for (const page of explicitPages) {
    const view = render(createElement(page.component));
    const title = screen.getByRole('heading', { level: 1, name: page.title });
    expect(title).toHaveAttribute('data-page-title');
    expect(title).toHaveAttribute('tabindex', '-1');
    view.unmount();
  }
}

test('renders all explicit workspace entry pages', rendersExplicitWorkspacePages);
