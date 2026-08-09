/**
 * @fileoverview Verifies that a real browser can reach and understand the foundation web shell.
 */

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

test('opens the foundation page', opensFoundationPage);
