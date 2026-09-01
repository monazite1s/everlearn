/**
 * @fileoverview 验证真实浏览器可以访问并理解基础应用壳。
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { startE2eEnvironment, releaseE2eEnvironment } from './environment';

test.beforeAll(async () => {
  // 首页数据来自真实 API，环境未拉起时错误态会污染可访问性扫描。
  await startE2eEnvironment();
});

test.afterAll(async () => {
  await releaseE2eEnvironment();
});

/** 用于验证官方外观菜单支持切换并在刷新后保持。 */
async function opensFoundationPage({ page }: { page: Page }): Promise<void> {
  await page.goto('/');

  await expect(page).toHaveTitle('Everlearn');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('首页');

  const menu = page.getByRole('button', { name: '外观设置' });
  await menu.click();
  await page.getByRole('menuitemradio', { name: '深色' }).click();
  await page.reload();

  await expect(page.locator('html')).toHaveAttribute('data-appearance', 'dark');
  await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'dark');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
}

/** 用于验证桌面导航同步更新路由、当前态、焦点和可访问性。 */
async function navigatesDesktopShell({ page }: { page: Page }): Promise<void> {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto('/');

  const pageAudit = await new AxeBuilder({ page }).analyze();
  expect(pageAudit.violations).toEqual([]);

  // 侧栏与面包屑存在同名链接，导航断言限定在工作区侧栏 landmark 内。
  const sidebarNav = page.getByLabel('工作区导航');
  await sidebarNav.getByRole('link', { name: '知识库', exact: true }).click();
  await expect(page).toHaveURL('/knowledge');
  const title = page.getByRole('heading', { level: 1, name: '知识库' });
  await expect(title).toBeFocused();
  await expect(sidebarNav.getByRole('link', { name: '知识库', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('button', { name: '全局搜索' })).toBeVisible();
  const mainBounds = await page.getByRole('main').boundingBox();
  expect(mainBounds?.width).toBeGreaterThanOrEqual(640);
  const routeAudit = await new AxeBuilder({ page }).analyze();
  expect(routeAudit.violations).toEqual([]);
}

test('opens the foundation page', opensFoundationPage);
test('navigates the accessible desktop shell', navigatesDesktopShell);
