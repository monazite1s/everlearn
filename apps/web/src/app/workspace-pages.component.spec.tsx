/** @fileoverview 验证每个显式工作区路由都有可聚焦模块入口页。 */

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

/** 用于验证各模块通过共享页面框架渲染自己的路由标题。 */
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
