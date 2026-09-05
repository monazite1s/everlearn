/** @fileoverview 验证书架、compose 对话创作、章节生成、三视图与单章失败重试的浏览器行为。 */

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { ensureMockLlmAlive, releaseE2eEnvironment, startE2eEnvironment } from './environment';
import { mockTutorialControl } from './tutorial-mock';

/** 教程状态轮询上限，覆盖研究、大纲与章节生成的全部 mock 延迟。 */
const TUTORIAL_POLL_TIMEOUT_MS = 90_000;
/** compose 快照依赖 5 秒轮询刷新，UI 断言放宽到两轮以上。 */
const COMPOSE_UI_TIMEOUT_MS = 15_000;

/** 测试内使用的教程详情最小形态。 */
interface TutorialDetailShape {
  chapters: {
    attempt: number;
    errorCode: string | null;
    id: string;
    status: string;
    title: string;
  }[];
  id: string;
  knowledgeBase: { id: string; kind: string } | null;
  status: string;
}

/** 用于轮询教程详情直到谓词满足。 */
async function waitForTutorial(
  request: APIRequestContext,
  id: string,
  predicate: (detail: TutorialDetailShape) => boolean,
): Promise<TutorialDetailShape> {
  const deadline = Date.now() + TUTORIAL_POLL_TIMEOUT_MS;
  let last: TutorialDetailShape | undefined;
  while (Date.now() < deadline) {
    const response = await request.get(`/api/v1/tutorials/${id}`);
    if (response.ok()) {
      last = (await response.json()) as TutorialDetailShape;
      if (predicate(last)) return last;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`tutorial ${id} did not converge; last=${JSON.stringify(last)}`);
}

/** 用于经 API 建教程并推进到大纲待确认，供非对话路径的用例准备。 */
async function createTutorialAwaitingOutline(
  request: APIRequestContext,
  topic: string,
): Promise<string> {
  const created = await request.post('/api/v1/tutorials', {
    data: {
      audience: 'E2E 验收受众',
      depth: 'standard',
      excludeTopics: [],
      goals: '',
      includeTopics: [],
      knowledgeBaseIds: [],
      level: 50,
      topic,
    },
  });
  expect(created.ok()).toBeTruthy();
  const { id } = (await created.json()) as { id: string };
  const confirmed = await request.post(`/api/v1/tutorials/${id}/confirm-scope`, { data: {} });
  expect(confirmed.ok()).toBeTruthy();
  await waitForTutorial(request, id, (detail) => detail.status === 'awaiting_outline');
  return id;
}

/** 用于经 API 确认大纲并触发建库与章节生成。 */
async function confirmOutline(request: APIRequestContext, id: string): Promise<void> {
  const confirmed = await request.post(`/api/v1/tutorials/${id}/confirm-outline`, { data: {} });
  expect(confirmed.ok()).toBeTruthy();
}

/** 用于删除教程产生的知识库，避免验收数据跨轮次累积拖慢搜索投影。 */
async function cleanupKnowledgeBase(request: APIRequestContext, tutorialId: string): Promise<void> {
  const detail = await request.get(`/api/v1/tutorials/${tutorialId}`);
  if (!detail.ok()) return;
  const kbId = ((await detail.json()) as TutorialDetailShape).knowledgeBase?.id;
  if (kbId === undefined) return;
  const kb = await request.get(`/api/v1/knowledge-bases/${kbId}`);
  if (!kb.ok()) return;
  const { version } = (await kb.json()) as { version: number };
  await request.delete(`/api/v1/knowledge-bases/${kbId}`, { data: { version } });
}

/** 用于在书架 UI 创建教程并进入 compose，返回新教程 id。 */
async function createTutorialInComposeUi(page: Page, topic: string): Promise<string> {
  await page.goto('/tutorials');
  // 书架空态与页头各有一个新建入口，固定使用页头按钮。
  await page.locator('header').getByRole('button', { name: '新建教程' }).click();
  await page.getByLabel('主题（必填）').fill(topic);
  await page.getByRole('button', { name: '创建并开始创作' }).click();
  await page.waitForURL(/\/tutorials\/[^/]+\/compose$/);
  const id = /\/tutorials\/([^/]+)\/compose$/.exec(new URL(page.url()).pathname)?.[1];
  if (id === undefined) throw new Error('compose url did not contain tutorial id');
  return id;
}

/** 用于发送 compose 消息并等待 Agent 提案卡出现。 */
async function sendComposeMessage(page: Page, content: string): Promise<void> {
  await page.getByLabel('输入消息').fill(content);
  await page.getByRole('button', { name: '发送', exact: true }).click();
}

/** 用于接受指定标题确认卡的决议按钮，避免与并存的其他 pending 卡混淆。 */
async function acceptCard(page: Page, cardTitle: string): Promise<void> {
  const card = page.locator('[data-slot="card"]', { hasText: cardTitle }).first();
  await card.getByRole('button', { name: '接受', exact: true }).click();
}

test.beforeAll(async () => {
  await startE2eEnvironment();
  // ai-assistant 的模型不可用用例会终止 mock LLM，本 spec 需要时先复活。
  await ensureMockLlmAlive();
});

test.afterAll(async () => {
  await releaseE2eEnvironment();
});

test.beforeEach(() => {
  // 章节生成与挂起窗口依赖 Worker 轮询节奏，放宽单用例超时。
  test.setTimeout(180_000);
  mockTutorialControl.brokenChapterTitles = [];
  mockTutorialControl.hangingChapterTitles = [];
});

/** 用于在 compose 对话中走完提案与大纲闸门，等待全部章节生成完成。 */
async function composeUntilCompleted(
  page: Page,
  request: APIRequestContext,
  tutorialId: string,
  topic: string,
): Promise<TutorialDetailShape> {
  await expect(page.getByRole('heading', { name: topic })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('确认研究范围').first()).toBeVisible();
  await sendComposeMessage(page, '请把受众调整为前端工程师并开始研究。');
  await expect(page.getByText('范围调整提案').first()).toBeVisible({
    timeout: COMPOSE_UI_TIMEOUT_MS,
  });
  await acceptCard(page, '范围调整提案');
  await waitForTutorial(request, tutorialId, (detail) => detail.status === 'awaiting_outline');
  // 大纲由 Worker 研究产出，接受大纲闸门后原子建库并开始章节生成。
  await expect(page.getByText('确认大纲并建库').first()).toBeVisible({
    timeout: COMPOSE_UI_TIMEOUT_MS,
  });
  await acceptCard(page, '确认大纲并建库');
  return waitForTutorial(
    request,
    tutorialId,
    (detail) =>
      detail.status === 'completed' &&
      detail.chapters.length === 3 &&
      detail.chapters.every((chapter) => chapter.status === 'completed'),
  );
}

/** 用于验证详情页三视图切换、?view= 持久化与图节点状态读屏文本。 */
async function assertDetailViews(page: Page, tutorialId: string): Promise<void> {
  await page.goto(`/tutorials/${tutorialId}`);
  await expect(page.getByLabel('章节大纲树')).toBeVisible();
  await page.getByRole('tab', { name: '列表' }).click();
  await expect(page).toHaveURL(new RegExp(`view=list`));
  await expect(page.getByRole('table', { name: '章节列表' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('table', { name: '章节列表' })).toBeVisible();
  await page.getByRole('tab', { name: '图' }).click();
  await expect(page.getByLabel('章节依赖图')).toBeVisible();
  // 已完成章节的图节点以链接呈现，节点名携带状态与依赖读屏文本。
  await expect(page.getByRole('link', { name: /进阶实战，状态 已完成/ })).toBeVisible();
}

test('compose 对话创作闭环生成章节并支持三视图阅读', async ({ page, request }) => {
  const topic = 'E2E 教程闭环主题';
  await page.goto('/tutorials');
  await expect(page.getByRole('heading', { level: 1, name: '教程' })).toBeVisible();
  const tutorialId = await createTutorialInComposeUi(page, topic);

  const completed = await composeUntilCompleted(page, request, tutorialId, topic);
  expect(completed.chapters.map((chapter) => chapter.attempt)).toEqual([1, 1, 1]);
  expect(completed.knowledgeBase?.kind).toBe('tutorial');

  // compose 右栏预览随会话更新出全部章节与完成徽标。
  const preview = page.getByRole('region', { name: '教程实时预览' });
  await expect(preview.getByText('已完成').first()).toBeVisible({
    timeout: COMPOSE_UI_TIMEOUT_MS,
  });
  await expect(preview.getByText('进阶实战')).toBeVisible();

  await assertDetailViews(page, tutorialId);

  // 章节跳转：列表视图进入章节文档路由。
  await page.getByRole('tab', { name: '列表' }).click();
  await page.getByRole('link', { name: '阅读本章' }).first().click();
  const kbId = completed.knowledgeBase!.id;
  await expect(page).toHaveURL(new RegExp(`/knowledge/${kbId}/documents/.+`));

  // 书架列表出现已完成的教程卡片（历史轮次可能残留同名教程，断言首个匹配）。
  await page.goto('/tutorials');
  const card = page.getByRole('list').filter({ hasText: topic }).locator('li').first();
  await expect(card).toBeVisible();
  await expect(card.getByText('已完成', { exact: true }).first()).toBeVisible();
  await cleanupKnowledgeBase(request, tutorialId);
});

test('单章失败警示并经新重试端点恢复', async ({ page, request }) => {
  mockTutorialControl.brokenChapterTitles = ['核心概念'];
  const tutorialId = await createTutorialAwaitingOutline(request, 'E2E 章节重试主题');
  await confirmOutline(request, tutorialId);

  // 依赖被失败章节阻塞：入门基础成功，核心概念失败，进阶实战保持待生成。
  const broken = await waitForTutorial(request, tutorialId, (detail) =>
    detail.chapters.some((chapter) => chapter.status === 'failed' && chapter.title === '核心概念'),
  );
  const brokenChapter = broken.chapters.find((chapter) => chapter.status === 'failed')!;
  expect(brokenChapter.errorCode).not.toBeNull();

  await page.goto(`/tutorials/${tutorialId}`);
  const retryButton = page.getByRole('button', { name: '重试章节 核心概念' });
  await expect(retryButton).toBeVisible();
  await expect(page.getByText(/本章失败（.+），可重试。/).first()).toBeVisible();

  mockTutorialControl.brokenChapterTitles = [];
  await retryButton.click();
  const retried = await waitForTutorial(
    request,
    tutorialId,
    (detail) => detail.status === 'completed',
  );
  const retriedChapter = retried.chapters.find((chapter) => chapter.id === brokenChapter.id)!;
  expect(retriedChapter.status).toBe('completed');
  expect(retriedChapter.attempt).toBe(2);
  // 失败章节重试成功后，被依赖阻塞的后续章节继续生成。
  expect(retried.chapters.every((chapter) => chapter.status === 'completed')).toBe(true);
  await cleanupKnowledgeBase(request, tutorialId);
});
