/** @fileoverview 验证资讯订阅运行后条目流标记、过滤、详情 Sheet、简报 tab 与键盘流的浏览器行为。 */

import { randomBytes } from 'node:crypto';

import AxeBuilder from '@axe-core/playwright';
import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';

import {
  E2E_INTERNAL_SECRET,
  E2E_LLM_PORT,
  ensureMockLlmAlive,
  releaseE2eEnvironment,
  startE2eEnvironment,
} from './environment';
import { mockNewsControl } from './tutorial-mock';

const SUBSCRIPTION_NAME = 'E2E 资讯订阅';
const SECOND_SUBSCRIPTION_NAME = 'E2E 第二订阅';
const RUN_CONVERGE_TIMEOUT_MS = 60_000;

/** mock 搜索结果标题用 [高]/[低]/[无关] 标记驱动三合一判定输出。 */
const MOCK_NEWS_RESULTS = [
  { title: '[高] E2E 高优条目一', url: 'https://mock.example/news-1' },
  { title: 'E2E 普通条目二', url: 'https://mock.example/news-2' },
  { title: '[低] E2E 低优条目三', url: 'https://mock.example/news-3' },
  { title: '[无关] E2E 无关条目四', url: 'https://mock.example/news-4' },
];

/** RSS 源 mock 地址：私网回环命中 SSRF 守卫，运行以抓取失败警告收尾。 */
const BLOCKED_FEED_URL = `http://127.0.0.1:${E2E_LLM_PORT}/rss/feed.xml`;

/** 订阅创建响应的最小投影。 */
interface SeededSubscription {
  id: string;
  newsKnowledgeBaseId: string;
}

/** 用于创建带 RSS mock 与搜索来源的订阅。 */
async function createSubscription(
  request: APIRequestContext,
  name: string,
): Promise<SeededSubscription> {
  const response = await request.post('/api/v1/news-subscriptions', {
    data: {
      name,
      sources: [
        { type: 'rss', value: BLOCKED_FEED_URL },
        { type: 'search', value: 'https://mock.example/search-source' },
      ],
      topic: name,
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as SeededSubscription;
}

/** 用于轮询订阅运行列表直到谓词满足。 */
async function waitForRuns(
  request: APIRequestContext,
  subscriptionId: string,
  predicate: (runs: { status: string; warnings: string[] }[]) => boolean,
): Promise<void> {
  const deadline = Date.now() + RUN_CONVERGE_TIMEOUT_MS;
  let last: { status: string; warnings: string[] }[] = [];
  while (Date.now() < deadline) {
    const response = await request.get(`/api/v1/digest-runs?subscriptionId=${subscriptionId}`);
    if (response.ok()) {
      last = (await response.json()) as { status: string; warnings: string[] }[];
      if (predicate(last)) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`news digest runs did not converge; last=${JSON.stringify(last)}`);
}

/** 用于在 UI 订阅菜单触发一次立即运行（单订阅场景菜单项唯一）。 */
async function runInUi(page: Page): Promise<void> {
  await page.getByRole('button', { name: '订阅', exact: true }).click();
  await page.getByRole('menuitem', { name: '立即运行' }).click();
}

/** 用于经内部端点伪造一条已判定 RSS 条目，覆盖 RSS 来源投影。 */
async function fabricateRssItem(
  request: APIRequestContext,
  subscription: SeededSubscription,
  title: string,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const run = await request.post(`/api/v1/news-subscriptions/${subscription.id}/run`, {
      data: {},
    });
    expect(run.ok()).toBeTruthy();
    const runId = ((await run.json()) as { id: string }).id;
    const registered = await request.post(`/api/v1/internal/news/runs/${runId}/items`, {
      data: {
        items: [
          {
            // 指纹须为 64 字符（sha256 形态），随机避免跨轮指纹去重。
            contentFingerprint: randomBytes(32).toString('hex'),
            publishedAt: null,
            snippet: 'mock RSS 条目摘要。',
            sourceType: 'rss',
            title,
            url: 'https://mock.example/rss-item',
          },
        ],
      },
      headers: { 'x-purge-secret': E2E_INTERNAL_SECRET },
    });
    if (!registered.ok()) continue;
    const itemId = ((await registered.json()) as { id: string }[])[0]?.id;
    if (itemId === undefined) continue;
    const completed = await request.post(`/api/v1/internal/news/runs/${runId}/complete`, {
      data: {
        itemImportance: [{ importance: 'normal', itemId, processedContent: 'mock RSS 处理正文。' }],
        sourceResults: [
          { decision: 'adopted', reason: '入选简报', title, url: 'https://mock.example/rss-item' },
        ],
        status: 'succeeded',
        warnings: [],
      },
      headers: { 'x-purge-secret': E2E_INTERNAL_SECRET },
    });
    if (completed.ok()) return;
  }
  throw new Error('fabricated rss item kept losing the claim race');
}

/** 用于等待订阅条目流达到目标条数。 */
async function waitForItemCount(
  request: APIRequestContext,
  subscriptionId: string,
  minimum: number,
): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const response = await request.get(`/api/v1/news-items?subscriptionId=${subscriptionId}`);
    if (response.ok()) {
      const { items } = (await response.json()) as { items: unknown[] };
      if (items.length >= minimum) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`news items did not reach ${minimum}`);
}

/** 用于清理订阅与其资讯知识库文档，避免跨轮次累积。 */
async function cleanup(
  request: APIRequestContext,
  subscription: SeededSubscription,
): Promise<void> {
  const docs = await request.get(
    `/api/v1/knowledge-bases/${subscription.newsKnowledgeBaseId}/documents`,
  );
  if (docs.ok()) {
    const list = (await docs.json()) as { items?: { id: string; version: number }[] };
    for (const doc of list.items ?? []) {
      await request.delete(`/api/v1/documents/${doc.id}`, { data: { version: doc.version } });
    }
  }
  const removed = await request.delete(`/api/v1/news-subscriptions/${subscription.id}`, {
    data: {},
  });
  expect(removed.ok()).toBeTruthy();
}

test.beforeAll(async () => {
  await startE2eEnvironment();
  // ai-assistant 的模型不可用用例会终止 mock LLM，资讯判定与搜索依赖它，先复活。
  await ensureMockLlmAlive();
  // 失败轮次会遗留订阅并挤爆订阅菜单，开跑前先清空既有资讯数据。
  const context = await playwrightRequest.newContext({ baseURL: 'http://127.0.0.1:3100' });
  try {
    const list = await context.get('/api/v1/news-subscriptions');
    const subs = (await list.json()) as SeededSubscription[];
    for (const sub of subs) await cleanup(context, sub);
  } finally {
    await context.dispose();
  }
});

test.afterAll(async () => {
  await releaseE2eEnvironment();
});

test.beforeEach(() => {
  test.setTimeout(120_000);
  mockNewsControl.webSearchResults = MOCK_NEWS_RESULTS;
});

/** 用于在页面上选择一个过滤下拉项。 */
async function pickFilter(page: Page, label: string, option: string): Promise<void> {
  await page.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).click();
}

/** 用于验证重要性过滤与主题过滤各自收敛条目流。 */
async function assertItemFilters(page: Page): Promise<void> {
  await pickFilter(page, '重要性', '高');
  await expect(page.getByText('E2E 高优条目一')).toBeVisible();
  await expect(page.getByText('E2E 普通条目二')).toHaveCount(0);
  await pickFilter(page, '重要性', '全部');
  await pickFilter(page, '主题', SECOND_SUBSCRIPTION_NAME);
  await expect(page.getByText('E2E RSS 条目五')).toBeVisible();
  await expect(page.getByText('E2E 高优条目一')).toHaveCount(0);
  await pickFilter(page, '主题', '全部主题');
}

/** 用于验证详情 Sheet 正文、处理过程折叠、原文外链与可访问性。 */
async function assertItemSheet(page: Page): Promise<void> {
  await page.getByRole('link', { name: '[高] E2E 高优条目一' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('mock 摘要：E2E 高优条目一');
  await expect(dialog.getByRole('link', { name: /查看原文/ })).toHaveAttribute(
    'href',
    'https://mock.example/news-1',
  );
  await dialog.getByText('处理过程').click();
  await expect(dialog.getByText('本轮处理有质量警告')).toBeVisible();
  await expect(dialog.getByText(/抓取失败/)).toBeVisible();
  await expect(dialog.getByText('已采纳').first()).toBeVisible();
  await expect(dialog.getByText('已跳过').first()).toBeVisible();
  await expect(dialog.getByText('LLM 判定不相关').first()).toBeVisible();
  const sheetAudit = await new AxeBuilder({ page }).analyze();
  expect(sheetAudit.violations).toEqual([]);
}

test('条目流渲染标记与过滤并支持 Sheet 详情深链', async ({ page, request }) => {
  const subscription = await createSubscription(request, SUBSCRIPTION_NAME);
  await page.goto('/news');
  await runInUi(page);
  // RSS mock 命中 SSRF 守卫：运行以抓取失败警告收尾，搜索来源产出三档条目。
  await waitForRuns(request, subscription.id, (runs) =>
    runs.some((run) => run.status === 'succeeded' && run.warnings.length > 0),
  );
  await waitForItemCount(request, subscription.id, 3);

  const second = await createSubscription(request, SECOND_SUBSCRIPTION_NAME);
  await fabricateRssItem(request, second, 'E2E RSS 条目五');

  await page.goto('/news');
  const list = page.getByRole('list').filter({ has: page.getByText('E2E 高优条目一') });
  // 高、普通、低按重要性升序排列，无关条目被 LLM 判定拒绝不出现在条目流。
  await expect(list.locator('li')).toHaveCount(4);
  await expect(list.locator('li').nth(0)).toContainText('E2E 高优条目一');
  await expect(list.locator('li').nth(3)).toContainText('E2E 低优条目三');
  await expect(page.getByText('E2E RSS 条目五')).toBeVisible();
  await expect(page.getByText('E2E 无关条目四')).toHaveCount(0);
  // 重要性形状与来源 Badge 双通道标记（低档按设计仅保留读屏文本）。
  await expect(list.locator('li').nth(0).getByText('重要性：高')).toBeVisible();
  await expect(list.locator('li').nth(1).getByText('重要性：普通')).toBeVisible();
  await expect(list.getByText('搜索', { exact: true }).first()).toBeVisible();
  await expect(list.getByText('RSS', { exact: true }).first()).toBeVisible();
  // 主题色点为纯装饰元素，仅断言其存在。
  await expect(list.locator('span[class*="bg-chart-"]').first()).toBeAttached();
  const streamAudit = await new AxeBuilder({ page }).analyze();
  expect(streamAudit.violations).toEqual([]);

  await assertItemFilters(page);
  await assertItemSheet(page);

  // ?item= 深链：刷新后 Sheet 保持打开。
  await expect(page).toHaveURL(/[?&]item=/);
  await page.reload();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('mock 摘要：E2E 高优条目一');

  await cleanup(request, second);
  await cleanup(request, subscription);
});

test('简报 tab 展示摘要卡与按日列表并可跳转文档', async ({ page, request }) => {
  const subscription = await createSubscription(request, SUBSCRIPTION_NAME);
  await request.post(`/api/v1/news-subscriptions/${subscription.id}/run`, { data: {} });
  await waitForRuns(request, subscription.id, (runs) =>
    runs.some((run) => run.status === 'succeeded'),
  );

  await page.goto('/news?tab=digests');
  await expect(page.getByText(`${SUBSCRIPTION_NAME} · `).first()).toBeVisible();
  await expect(page.getByText('聚合 3 条资讯条目')).toBeVisible();
  await page.getByRole('link', { name: '打开简报' }).click();
  await expect(page).toHaveURL(
    new RegExp(`/knowledge/${subscription.newsKnowledgeBaseId}/documents/.+`),
  );
  await expect(page.getByText('Mock 简报总述')).toBeVisible();

  await cleanup(request, subscription);
});

test('失败来源的运行警示可经再次运行重试', async ({ page, request }) => {
  const subscription = await createSubscription(request, SUBSCRIPTION_NAME);
  await request.post(`/api/v1/news-subscriptions/${subscription.id}/run`, { data: {} });
  await waitForRuns(request, subscription.id, (runs) => runs.length >= 1);

  // RSS mock 持续失败：再次运行产生新一轮简报，按日列表可见两份。
  await page.goto('/news?tab=digests');
  await runInUi(page);
  await waitForRuns(request, subscription.id, (runs) => runs.length >= 2);
  await page.reload();
  await expect(page.getByText(`${SUBSCRIPTION_NAME} · `).first()).toBeVisible();
  const briefRows = page.getByRole('list').filter({ hasText: `${SUBSCRIPTION_NAME} ·` });
  await expect(briefRows.locator('li').first()).toBeVisible();
  await expect(briefRows.locator('li')).toHaveCount(2, { timeout: 15_000 });

  await cleanup(request, subscription);
});
