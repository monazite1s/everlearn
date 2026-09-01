/** @fileoverview 在真实 Chromium、Nest API 与 PostgreSQL 上验收 SEARCH-02 关键路径。 */

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import type { APIRequestContext } from '@playwright/test';

import { startE2eEnvironment, releaseE2eEnvironment } from './environment';
import { seedSearchFixtures, type SearchFixture } from './search-fixture';

// 环境启动与投影收敛慢于默认 30 秒，整体放宽单用例预算。
test.setTimeout(90_000);

let fixture: SearchFixture | undefined;

/** 用于输入查询并等待真实 Search API 返回。 */
async function searchFor(page: Page, query: string): Promise<void> {
  const request = page.waitForResponse(
    (response) => response.url().includes('/api/v1/search?') && response.status() === 200,
  );
  await page.getByRole('searchbox').fill(query);
  await request;
}

/** 用于验证全局标题搜索、分页与可访问性。 */
async function searchesAndPaginates(page: Page): Promise<void> {
  await page.goto('/search?field=title');
  await expect(page.getByRole('searchbox')).toBeFocused();
  await searchFor(page, 'outbox');
  await expect(page.getByRole('link', { name: 'outbox note 01' })).toBeVisible();
  await page.getByRole('button', { name: '加载更多' }).click();
  await expect(page.getByRole('link', { name: 'outbox note 21' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^outbox note/ })).toHaveCount(21);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(
    audit.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([]);
  await page.screenshot({ fullPage: true, path: 'test-results/search02-light.png' });
}

/** 用于验证当前库范围名称、390px 排布与键盘返回。 */
async function searchesCurrentKnowledgeBase(page: Page): Promise<void> {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto(`/search?scope=knowledgeBase&knowledgeBaseId=${fixture!.baseId}&field=title`);
  await expect(page.getByText('搜索验收知识库')).toBeVisible();
  await searchFor(page, 'outbox');
  await expect(page.getByRole('link', { name: 'outbox note 01' })).toBeVisible();
  await expect(page.getByLabel('搜索字段')).toBeVisible();
  await expect(page.getByLabel('更新时间')).toBeVisible();
  await page.screenshot({ fullPage: true, path: 'test-results/search02-mobile-390.png' });
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/knowledge');
}

/** 用于验证正文结果携带 Block 参数并在真实编辑器中获得焦点。 */
async function locatesBodyBlock(page: Page): Promise<void> {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/search?field=content');
  await searchFor(page, 'needle');
  await page.getByRole('link', { name: '正文定位验收' }).click();
  await expect(page).toHaveURL(new RegExp(`searchBlockId=${fixture!.bodyBlockId}`));
  const target = page.locator(`[data-block-id="${fixture!.bodyBlockId}"]`);
  await expect(target).toHaveAttribute('data-search-target', 'true');
  await expect(target).toBeFocused();
}

/** 用于验证壳快捷键、退出历史和触发器焦点恢复。 */
async function usesGlobalShortcut(page: Page): Promise<void> {
  await page.goto('/knowledge');
  await page.keyboard.press('Meta+k');
  await expect(page).toHaveURL('/search');
  await expect(page.getByRole('searchbox')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL('/knowledge');
  await expect(page.getByRole('button', { name: '全局搜索' })).toBeFocused();
}

/** 用于验证字段、时间筛选写入 URL 并驱动真实请求。 */
async function filtersBodyResults(page: Page): Promise<void> {
  await page.goto('/search?query=needle');
  await page.getByLabel('搜索字段').click();
  const fieldRequest = page.waitForResponse((response) =>
    response.url().includes('/api/v1/search?query=needle&field=content'),
  );
  await page.getByRole('option', { name: '仅正文' }).click();
  await fieldRequest;
  await page.getByLabel('更新时间').click();
  const timeRequest = page.waitForResponse(
    (response) => response.url().includes('updatedAfter=') && response.status() === 200,
  );
  await page.getByRole('option', { name: '过去 30 天' }).click();
  await timeRequest;
  await expect(page).toHaveURL(/field=content.*updatedWithin=30d/);
  await expect(page.getByRole('link', { name: '正文定位验收' })).toBeVisible();
}

/** 用于验证失效 Block 回退提示可感知且不会聚焦标题输入。 */
async function fallsBackFromMissingBlock(page: Page): Promise<void> {
  const missingBlockId = '64000000-0000-4000-8000-000000000099';
  await page.goto(
    `/knowledge/${fixture!.baseId}/documents/${fixture!.bodyDocumentId}?searchBlockId=${missingBlockId}&searchDocumentVersion=1`,
  );
  const status = page.getByRole('status', { name: '匹配内容已更新' });
  await expect(status).toBeVisible();
  await expect(status).toBeFocused();
}

/** 用于验证离线保留结果且禁用会产生新请求的动作。 */
async function preservesOfflineResults(page: Page): Promise<void> {
  await page.goto('/search');
  await searchFor(page, 'outbox');
  await page.context().setOffline(true);
  await expect(page.getByText(/当前离线/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'outbox note 01' })).toBeVisible();
  await expect(page.getByRole('button', { name: '刷新结果' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '加载更多' })).toBeDisabled();
}

/** 用于验证深色模式仍保持搜索层级与严重可访问性零缺陷。 */
async function checksDarkAppearance(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('everlearn-theme', 'dark'));
  await page.goto('/search?field=title');
  await searchFor(page, 'outbox');
  await expect(page.locator('html')).toHaveClass(/\bdark\b/);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(
    audit.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([]);
  await page.screenshot({ fullPage: true, path: 'test-results/search02-dark.png' });
}

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  await startE2eEnvironment();
  fixture = await seedSearchFixtures(request);
});

test.afterAll(async () => {
  await releaseE2eEnvironment();
});

test('searches and paginates accessible title results', async ({ page }) => {
  await searchesAndPaginates(page);
});

test('searches the current knowledge base on mobile', async ({ page }) => {
  await searchesCurrentKnowledgeBase(page);
});

test('locates a content block with reduced motion', async ({ page }) => {
  await locatesBodyBlock(page);
});

test('uses the global shortcut and restores focus', async ({ page }) => {
  await usesGlobalShortcut(page);
});

test('applies field and time filters', async ({ page }) => {
  await filtersBodyResults(page);
});

test('falls back when a matched block no longer exists', async ({ page }) => {
  await fallsBackFromMissingBlock(page);
});

test('keeps loaded results usable while offline', async ({ page }) => {
  await preservesOfflineResults(page);
});

test('renders an accessible dark search surface', async ({ page }) => {
  await checksDarkAppearance(page);
});
