/**
 * @fileoverview 验证真实浏览器可以访问并理解基础应用壳。
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** 用于验证主题控件支持键盘操作并在刷新后保持。 */
async function opensFoundationPage({ page }: { page: Page }): Promise<void> {
  await page.goto('/');

  await expect(page).toHaveTitle('Everlearn');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('首页');

  const theme = page.getByLabel('主题', { exact: true });
  const appearance = page.getByLabel('外观', { exact: true });
  await theme.focus();
  await expect(theme).toBeFocused();
  await theme.selectOption('neutral');
  await appearance.selectOption('dark');
  await page.reload();

  await expect(theme).toHaveValue('neutral');
  await expect(appearance).toHaveValue('dark');
  await expect(page.locator('html')).toHaveAttribute('data-color-mode', 'dark');
}

/** 用于验证桌面导航同步更新路由、当前态、焦点和可访问性。 */
async function navigatesDesktopShell({ page }: { page: Page }): Promise<void> {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto('/');

  const pageAudit = await new AxeBuilder({ page }).analyze();
  expect(pageAudit.violations).toEqual([]);

  await page.getByRole('link', { name: '知识库', exact: true }).click();
  await expect(page).toHaveURL('/knowledge');
  const title = page.getByRole('heading', { level: 1, name: '知识库' });
  await expect(title).toBeFocused();
  await expect(page.getByRole('link', { name: '知识库', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('complementary', { name: '当前上下文' })).toBeVisible();
  const mainBounds = await page.getByRole('main').boundingBox();
  expect(mainBounds?.width).toBeGreaterThanOrEqual(640);
  const routeAudit = await new AxeBuilder({ page }).analyze();
  expect(routeAudit.violations).toEqual([]);
  await page.screenshot({ fullPage: true, path: 'test-results/ui-03-desktop.png' });
}

test('opens the foundation page', opensFoundationPage);
test('navigates the accessible desktop shell', navigatesDesktopShell);
