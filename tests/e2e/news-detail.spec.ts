/** @fileoverview 验证资讯页简报运行的警告条、来源采纳明细与失败重试的浏览器行为。 */

import { expect, test, type APIRequestContext } from '@playwright/test';

import {
  E2E_INTERNAL_SECRET,
  E2E_LLM_PORT,
  releaseE2eEnvironment,
  startE2eEnvironment,
} from './environment';

/** 资讯订阅在私网 feed 主机上的地址：真实执行会命中 SSRF 守卫并走失败说明路径。 */
const BLOCKED_FEED_URL = `http://127.0.0.1:${E2E_LLM_PORT}/rss/feed.xml`;

/** 用于为订阅创建一条待执行运行。 */
async function createRun(request: APIRequestContext, subscriptionId: string): Promise<string> {
  const response = await request.post(`/api/v1/news/subscriptions/${subscriptionId}/run`, {
    data: {},
  });
  if (!response.ok()) {
    throw new Error(`create news run failed: ${response.status()} ${await response.text()}`);
  }
  return ((await response.json()) as { id: string }).id;
}

/** 用于把一条运行经内部端点写成终态（与 Worker 汇报同构）。 */
async function completeRunInternally(
  request: APIRequestContext,
  runId: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  const response = await request.post(`/api/v1/internal/news/runs/${runId}/complete`, {
    data: body,
    headers: { 'x-purge-secret': E2E_INTERNAL_SECRET },
  });
  return response.ok();
}

/** 用于创建订阅并用重试吸收领取竞态地伪造一条终态运行。 */
async function fabricateRun(
  request: APIRequestContext,
  subscriptionId: string,
  body: Record<string, unknown>,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const runId = await createRun(request, subscriptionId);
    if (await completeRunInternally(request, runId, body)) return;
  }
  throw new Error('fabricated news run kept losing the claim race');
}

/** 用于轮询某订阅的运行列表直到谓词满足。 */
async function waitForRuns(
  request: APIRequestContext,
  subscriptionId: string,
  predicate: (runs: { id: string; status: string; warnings: string[] }[]) => boolean,
): Promise<void> {
  const deadline = Date.now() + 40_000;
  while (Date.now() < deadline) {
    const response = await request.get(`/api/v1/news/digest-runs?subscriptionId=${subscriptionId}`);
    if (response.ok()) {
      const runs = (await response.json()) as { id: string; status: string; warnings: string[] }[];
      if (predicate(runs)) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('news digest runs did not converge');
}

/** 用于用真实执行与伪造运行铺好运行历史，返回断言前的运行条数。 */
async function seedNewsRuns(
  request: APIRequestContext,
  subscription: { id: string },
): Promise<number> {
  // 真实 Worker 执行：SSRF 守卫拦截私网 feed，运行以告警收尾并生成失败说明文档。
  await createRun(request, subscription.id);
  await waitForRuns(request, subscription.id, (runs) =>
    runs.some((run) => run.status === 'succeeded' && run.warnings.length > 0),
  );

  // SSRF 守卫的测试缝（allowPrivateFeedUrls）仅存在于执行器配置，无法从进程环境开启，
  // 来源明细与失败终态改为经内部端点伪造运行数据做浏览器级验收。
  await fabricateRun(request, subscription.id, {
    sourceResults: [
      {
        decision: 'adopted',
        reason: '入选简报',
        title: '已采纳来源',
        url: 'https://mock.example/a',
      },
      {
        decision: 'skipped',
        reason: 'LLM 判定不相关',
        title: '被跳过来源',
        url: 'https://mock.example/b',
      },
    ],
    status: 'succeeded',
    warnings: ['来源不足，简报仅基于 1 条来源'],
  });
  await fabricateRun(request, subscription.id, { errorCode: 'INTERNAL_ERROR', status: 'failed' });
  const runsBeforeResponse = await request.get(
    `/api/v1/news/digest-runs?subscriptionId=${subscription.id}`,
  );
  const runsBefore = ((await runsBeforeResponse.json()) as { id: string }[]).length;
  expect(runsBefore).toBeGreaterThanOrEqual(3);
  return runsBefore;
}

test.beforeAll(async () => {
  await startE2eEnvironment();
});

test.afterAll(async () => {
  await releaseE2eEnvironment();
});

test('news page shows run warnings, source decisions and failed run retry', async ({
  page,
  request,
}) => {
  const created = await request.post('/api/v1/news/subscriptions', {
    data: { feedUrl: BLOCKED_FEED_URL, name: 'E2E 资讯订阅' },
  });
  expect(created.ok()).toBeTruthy();
  const subscription = (await created.json()) as {
    id: string;
    newsKnowledgeBaseId: string;
  };
  const runsBefore = await seedNewsRuns(request, subscription);

  await page.goto('/news');
  await expect(page.getByText('E2E 资讯订阅').first()).toBeVisible();
  const expanders = page.getByRole('button', { name: '展开或收起运行详情' });
  await expect(expanders.first()).toBeVisible();
  const expanderCount = await expanders.count();
  for (let index = 0; index < expanderCount; index += 1) await expanders.nth(index).click();

  await expect(page.getByText(/资讯源抓取失败/).first()).toBeVisible();
  await expect(page.getByText('来源不足，简报仅基于 1 条来源').first()).toBeVisible();
  await expect(page.getByText('✓ 已采纳').first()).toBeVisible();
  await expect(page.getByText('✗ 已跳过').first()).toBeVisible();
  await expect(page.getByText('入选简报').first()).toBeVisible();
  await expect(page.getByText('LLM 判定不相关').first()).toBeVisible();

  const failedRow = page.locator('li', { hasText: 'failed' }).filter({
    has: page.getByRole('button', { name: '重试本轮简报' }),
  });
  await expect(failedRow.first()).toBeVisible();
  await expect(page.getByText('服务内部错误，请稍后重试。').first()).toBeVisible();

  await failedRow.first().getByRole('button', { name: '重试本轮简报' }).click();
  await waitForRuns(
    request,
    subscription.id,
    (runs) =>
      runs.length > runsBefore &&
      runs.every((run) => run.status !== 'pending' && run.status !== 'running'),
  );
  await cleanupNewsData(request, subscription);
});

/** 用于删除失败说明文档与订阅，避免自动化文档污染搜索投影并跨轮次累积。 */
async function cleanupNewsData(
  request: APIRequestContext,
  subscription: { id: string; newsKnowledgeBaseId?: string },
): Promise<void> {
  if (subscription.newsKnowledgeBaseId !== undefined) {
    const docs = await request.get(
      `/api/v1/knowledge-bases/${subscription.newsKnowledgeBaseId}/documents`,
    );
    if (docs.ok()) {
      const list = (await docs.json()) as {
        items?: { id: string; version: number }[];
      };
      for (const doc of list.items ?? []) {
        await request.delete(`/api/v1/documents/${doc.id}`, {
          data: { version: doc.version },
        });
      }
    }
  }
  const removed = await request.delete(`/api/v1/news/subscriptions/${subscription.id}`, {
    data: {},
  });
  expect(removed.ok()).toBeTruthy();
}
