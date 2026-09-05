/** @fileoverview 验证每个显式工作区路由都有可聚焦模块入口页。 */

import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import type { ComponentType, ReactElement } from 'react';
import { afterEach, expect, test, vi } from 'vitest';

import NewsRoute from '../news/page';
import SettingsPage from '../settings/page';
import TutorialsPage from '../tutorials/page';
import WorkflowsPage from '../workflows/page';

vi.mock('next/navigation', () => ({
  /** 用于在 jsdom 下提供资讯页 URL 同步所需的最小路由。 */
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

/** 用于构造可同步或异步解析的页面元素。 */
type PageLoader = () => ComponentType | Promise<ReactElement> | ReactElement;

interface ExplicitPageCase {
  load: PageLoader;
  marker: string;
  title: string;
}

const explicitPages: readonly ExplicitPageCase[] = [
  {
    /** 用于加载 async 资讯路由并解析空查询参数。 */
    load: () => NewsRoute({ searchParams: Promise.resolve({}) }),
    marker: '条目流',
    title: '资讯',
  },
  { /** 用于加载教程路由。 */ load: () => TutorialsPage, marker: '新建教程', title: '教程' },
  { /** 用于加载工作流路由。 */ load: () => WorkflowsPage, marker: '从模板创建', title: '工作流' },
  { /** 用于加载设置路由。 */ load: () => SettingsPage, marker: '工作区已就绪', title: '设置' },
];

afterEach(cleanup);

/** 用于把页面加载结果解析为可渲染元素。 */
async function resolvePageElement(load: PageLoader): Promise<ReactElement> {
  const resolved = await load();
  return typeof resolved === 'function' ? createElement(resolved) : resolved;
}

/** 用于验证各模块通过共享页面框架渲染自己的路由标题。 */
async function rendersExplicitWorkspacePages(): Promise<void> {
  for (const page of explicitPages) {
    const view = render(await resolvePageElement(page.load));
    const title = screen.getByRole('heading', { level: 1, name: page.title });
    expect(title).toHaveAttribute('data-page-title');
    expect(title).toHaveAttribute('tabindex', '-1');
    expect(view.container.textContent).toContain(page.marker);
    view.unmount();
  }
}

test('renders all explicit workspace entry pages', rendersExplicitWorkspacePages);
