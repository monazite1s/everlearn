/** @fileoverview 验证每个显式工作区路由都有可聚焦模块入口页。 */

import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import type { ComponentType } from 'react';
import { afterEach, expect, test } from 'vitest';

import NewsPage from '../news/page';
import SettingsPage from '../settings/page';
import TutorialsPage from '../tutorials/page';
import WorkflowsPage from '../workflows/page';

interface ExplicitPageCase {
  component: ComponentType;
  marker: string;
  title: string;
}

const explicitPages: readonly ExplicitPageCase[] = [
  { component: NewsPage, marker: '创建订阅', title: '资讯' },
  { component: TutorialsPage, marker: '新建教程', title: '教程' },
  { component: WorkflowsPage, marker: '从模板创建', title: '工作流' },
  { component: SettingsPage, marker: '工作区已就绪', title: '设置' },
];

afterEach(cleanup);

/** 用于验证各模块通过共享页面框架渲染自己的路由标题。 */
function rendersExplicitWorkspacePages(): void {
  for (const page of explicitPages) {
    const view = render(createElement(page.component));
    const title = screen.getByRole('heading', { level: 1, name: page.title });
    expect(title).toHaveAttribute('data-page-title');
    expect(title).toHaveAttribute('tabindex', '-1');
    expect(view.container.textContent).toContain(page.marker);
    view.unmount();
  }
}

test('renders all explicit workspace entry pages', rendersExplicitWorkspacePages);
