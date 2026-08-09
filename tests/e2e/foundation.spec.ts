/**
 * @fileoverview Verifies that a real browser can reach and understand the foundation web shell.
 */

import { expect, test, type Page } from '@playwright/test';

/** Confirms the browser-visible entry page is usable without implementation-only selectors. */
async function opensFoundationPage({ page }: { page: Page }): Promise<void> {
  await page.goto('/');

  await expect(page).toHaveTitle('Everlearn');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Everlearn 工程基线');
}

test('opens the foundation page', opensFoundationPage);
