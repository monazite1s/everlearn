/**
 * @fileoverview Verifies that a real browser can reach and understand the foundation web shell.
 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/** Confirms theme controls remain keyboard reachable and persist across a reload. */
async function opensFoundationPage({ page }: { page: Page }): Promise<void> {
  await page.goto('/');

  await expect(page).toHaveTitle('Everlearn');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('一套语义，四种光线');

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

/** Confirms the shared component specimen has no automatically detectable WCAG violations. */
async function auditsSharedComponents({ page }: { page: Page }): Promise<void> {
  await page.goto('/');

  const pageAudit = await new AxeBuilder({ page }).analyze();
  expect(pageAudit.violations).toEqual([]);

  await page.getByRole('button', { name: '新建文档' }).click();
  await expect(page.getByRole('dialog', { name: '新建文档' })).toBeVisible();
  const dialogAudit = await new AxeBuilder({ page }).analyze();
  expect(dialogAudit.violations).toEqual([]);
}

test('opens the foundation page', opensFoundationPage);
test('passes automated accessibility checks', auditsSharedComponents);
