/** @fileoverview 验证根路由渲染知识优先首页组合。 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import HomePage from './page';
import { ThemeProvider } from './theme-provider';

/** 用于在路由场景后恢复 DOM 和请求状态。 */
function resetRoute(): void {
  cleanup();
  vi.unstubAllGlobals();
}

afterEach(resetRoute);

/** 用于验证根路由公开标题和主要知识区域。 */
function rendersWorkspaceEntry(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockReturnValue(
      new Promise(
        /** 用于让结构断言保持真实加载状态。 */
        () => undefined,
      ),
    ),
  );
  render(
    <ThemeProvider>
      <HomePage />
    </ThemeProvider>,
  );

  const heading = screen.getByRole('heading', { level: 1, name: '首页' });
  expect(heading).toHaveAttribute('data-page-title');
  expect(heading).toHaveAttribute('tabindex', '-1');
  expect(screen.getByRole('heading', { level: 2, name: '继续学习' })).toBeVisible();
  expect(screen.getByRole('heading', { level: 2, name: '知识库' })).toBeVisible();
}

test('renders the workspace entry', rendersWorkspaceEntry);
