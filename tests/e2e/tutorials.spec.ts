/** @fileoverview 验证教程研究确认、章节生成闭环、单章失败重试与取消的浏览器行为。 */

import { randomUUID } from 'node:crypto';

import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

import { ensureMockLlmAlive, releaseE2eEnvironment, startE2eEnvironment } from './environment';
import { saveDocumentContent, seedDocument, seedKnowledgeBase } from './seed-helpers';
import { mockTutorialControl } from './tutorial-mock';

/** 教程详情的轮询上限，覆盖大纲研究与章节生成的全部 mock 延迟。 */
const TUTORIAL_POLL_TIMEOUT_MS = 60_000;

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
  status: string;
  tutorialKnowledgeBaseId: string | null;
}

/** 用于构造教程验收共用的范围输入。 */
function scopeInput(topic: string, knowledgeBaseIds: string[] = []): Record<string, unknown> {
  return {
    audience: 'E2E 验收受众',
    depth: 'standard',
    excludeTopics: [],
    goals: '',
    includeTopics: ['核心概念'],
    knowledgeBaseIds,
    level: 50,
    topic,
  };
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

/** 用于经 API 建教程并确认研究，等待大纲就绪。 */
async function confirmScopeAndWaitOutline(
  request: APIRequestContext,
  topic: string,
): Promise<string> {
  const created = await request.post('/api/v1/tutorials', { data: scopeInput(topic) });
  expect(created.ok()).toBeTruthy();
  const { id } = (await created.json()) as { id: string };
  const confirmed = await request.post(`/api/v1/tutorials/${id}/confirm-scope`, { data: {} });
  expect(confirmed.ok()).toBeTruthy();
  await waitForTutorial(request, id, (detail) => detail.status === 'outline_ready');
  return id;
}

/** 用于经 API 确认大纲。 */
async function confirmOutline(request: APIRequestContext, id: string): Promise<void> {
  const confirmed = await request.post(`/api/v1/tutorials/${id}/confirm-outline`, { data: {} });
  expect(confirmed.ok()).toBeTruthy();
}

/** 用于在创建表单填写范围并提交，返回新教程 id（按列表差集定位，隔离历史数据）。 */
async function createTutorialInUi(
  page: Page,
  request: APIRequestContext,
  kbName: string,
): Promise<string> {
  const before = await listTutorialIds(request);
  await page.goto('/tutorials');
  await page.getByLabel('主题', { exact: true }).fill('E2E 教程闭环主题');
  await page.getByLabel('受众', { exact: true }).fill('E2E 验收受众');
  await page.getByLabel('水平', { exact: true }).fill('50');
  await page.getByLabel(kbName).check();
  await page.getByRole('button', { name: '创建教程' }).click();
  await expect(page.getByRole('link', { name: /E2E 教程闭环主题/ }).first()).toBeVisible();
  const created = (await listTutorialIds(request)).find((id) => !before.includes(id));
  if (created === undefined) throw new Error('created tutorial id not found in list');
  return created;
}

/** 用于列出当前教程会话 id。 */
async function listTutorialIds(request: APIRequestContext): Promise<string[]> {
  const response = await request.get('/api/v1/tutorials');
  expect(response.ok()).toBeTruthy();
  return ((await response.json()) as { id: string }[]).map((item) => item.id);
}

/** 用于在详情页编辑大纲首章标题并确认大纲。 */
async function confirmOutlineInUi(page: Page, tutorialId: string): Promise<void> {
  await page.goto(`/tutorials/${tutorialId}`);
  const firstTitle = page.getByLabel('第 1 章标题');
  await expect(firstTitle).toBeVisible();
  await expect(page.getByLabel('第 3 章摘要')).toHaveValue(/综合运用/);
  await firstTitle.fill('入门基础（修订版）');
  await page.getByRole('button', { name: '确认大纲并创建教程知识库' }).click();
}

/** 用于断言确认大纲后占位文档立即建好并等章节全部生成完成。 */
async function assertGeneratedChapters(
  request: APIRequestContext,
  tutorialId: string,
): Promise<void> {
  const confirmed = await waitForTutorial(
    request,
    tutorialId,
    (detail) => detail.tutorialKnowledgeBaseId !== null,
  );
  const docs = await request.get(
    `/api/v1/knowledge-bases/${confirmed.tutorialKnowledgeBaseId}/documents`,
  );
  expect(docs.ok()).toBeTruthy();
  const docTitles = ((await docs.json()) as { items: { title: string }[] }).items.map(
    (item) => item.title,
  );
  expect(docTitles).toEqual(expect.arrayContaining(['入门基础（修订版）', '核心概念', '进阶实战']));
  const completed = await waitForTutorial(
    request,
    tutorialId,
    (detail) =>
      detail.status === 'completed' &&
      detail.chapters.every((chapter) => chapter.status === 'succeeded'),
  );
  expect(completed.chapters.map((chapter) => chapter.attempt)).toEqual([1, 1, 1]);
}

/** 用于删除教程产生的知识库，避免验收数据跨轮次累积拖慢搜索投影。 */
async function cleanupKnowledgeBase(request: APIRequestContext, tutorialId: string): Promise<void> {
  const detail = await request.get(`/api/v1/tutorials/${tutorialId}`);
  if (!detail.ok()) return;
  const kbId = ((await detail.json()) as TutorialDetailShape).tutorialKnowledgeBaseId;
  if (kbId === null) return;
  const kb = await request.get(`/api/v1/knowledge-bases/${kbId}`);
  if (!kb.ok()) return;
  const { version } = (await kb.json()) as { version: number };
  await request.delete(`/api/v1/knowledge-bases/${kbId}`, { data: { version } });
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
  test.setTimeout(90_000);
  mockTutorialControl.brokenChapterTitles = [];
  mockTutorialControl.hangingChapterTitles = [];
});

test('tutorial full loop generates chapters with cited sources', async ({ page, request }) => {
  const kbId = await seedKnowledgeBase(request, 'E2E 教程参考库');
  const refDocId = await seedDocument(request, kbId, '教程参考文档');
  await saveDocumentContent(request, refDocId, {
    content: [
      {
        attrs: { blockId: randomUUID() },
        content: [{ text: '教程参考要点正文。', type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  });

  const tutorialId = await createTutorialInUi(page, request, 'E2E 教程参考库');
  // ponytail: 详情页草稿面板读取 detail.scope，而 API 返回顶层范围字段，确认按钮恒为禁用；
  // 待前端契约修正后改回页面内点击「确认并开始研究」。
  const confirmedScope = await request.post(`/api/v1/tutorials/${tutorialId}/confirm-scope`, {
    data: {},
  });
  expect(confirmedScope.ok()).toBeTruthy();
  await waitForTutorial(request, tutorialId, (detail) => detail.status === 'outline_ready');

  await confirmOutlineInUi(page, tutorialId);
  await assertGeneratedChapters(request, tutorialId);

  await page.goto(`/tutorials/${tutorialId}`);
  await expect(page.getByText('已完成').first()).toBeVisible();
  await page.getByRole('link', { name: '阅读本章' }).first().click();
  await expect(page).toHaveURL(/\/knowledge\/.+\/documents\/.+/);
  // ponytail: 自动化正文（blocks 形态）当前不被文档编辑器渲染，正文来源列表经内容 API 断言。
  const docId = new URL(page.url()).pathname.split('/').pop()!;
  const content = await request.get(`/api/v1/documents/${docId}/content`);
  expect(content.ok()).toBeTruthy();
  expect(JSON.stringify(await content.json())).toContain('参考来源');
  expect(JSON.stringify(await content.json())).toContain('[1]');
  await expect(page.getByText('本教程有告警')).toHaveCount(0);
  await cleanupKnowledgeBase(request, tutorialId);
});

test('failed chapter retry succeeds with attempt 2', async ({ page, request }) => {
  mockTutorialControl.brokenChapterTitles = ['核心概念'];
  const tutorialId = await confirmScopeAndWaitOutline(request, 'E2E 章节重试主题');
  await confirmOutline(request, tutorialId);

  // 依赖被失败章节阻塞：入门基础成功，核心概念失败，进阶实战保持待生成。
  const broken = await waitForTutorial(
    request,
    tutorialId,
    (detail) =>
      detail.chapters.some(
        (chapter) => chapter.status === 'failed' && chapter.title === '核心概念',
      ) && detail.chapters.some((chapter) => chapter.status === 'pending'),
  );
  const brokenChapter = broken.chapters.find((chapter) => chapter.status === 'failed')!;
  expect(brokenChapter.errorCode).toBe('LLM_UPSTREAM_ERROR');

  await page.goto(`/tutorials/${tutorialId}`);
  const retryButton = page.getByRole('button', { name: '重试章节 核心概念' });
  await expect(retryButton).toBeVisible();
  await expect(page.getByText('本章失败（LLM_UPSTREAM_ERROR），可重试。')).toBeVisible();

  mockTutorialControl.brokenChapterTitles = [];
  await retryButton.click();
  const retried = await waitForTutorial(
    request,
    tutorialId,
    (detail) => detail.status === 'completed',
  );
  const retriedChapter = retried.chapters.find((chapter) => chapter.id === brokenChapter.id)!;
  expect(retriedChapter.status).toBe('succeeded');
  expect(retriedChapter.attempt).toBe(2);
  // 失败章节重试成功后，被依赖阻塞的后续章节继续生成。
  expect(retried.chapters.every((chapter) => chapter.status === 'succeeded')).toBe(true);
  await cleanupKnowledgeBase(request, tutorialId);
});

test('cancel marks pending chapters canceled and worker stops claiming', async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  mockTutorialControl.hangingChapterTitles = ['入门基础'];
  const tutorialId = await confirmScopeAndWaitOutline(request, 'E2E 取消主题');
  await confirmOutline(request, tutorialId);

  // 挂起首章阻塞依赖链，后续两章保持待生成，形成稳定取消窗口。
  await waitForTutorial(request, tutorialId, (detail) => {
    const statuses = detail.chapters.map((chapter) => chapter.status);
    return statuses.includes('generating') && statuses.includes('pending');
  });

  await page.goto(`/tutorials/${tutorialId}`);
  const cancelButton = page.getByRole('button', { name: '取消剩余章节' });
  await expect(cancelButton).toBeVisible();
  await cancelButton.click();

  await waitForTutorial(request, tutorialId, (detail) =>
    detail.chapters.some((chapter) => chapter.status === 'canceled'),
  );
  // 挂起章节随后自然完成，被取消章节不得被重新领取生成。
  const finalDetail = await waitForTutorial(
    request,
    tutorialId,
    (detail) => detail.status === 'completed' || detail.status === 'partial',
  );
  const canceledTitles = finalDetail.chapters
    .filter((chapter) => chapter.status === 'canceled')
    .map((chapter) => chapter.title);
  expect(canceledTitles).toEqual(['核心概念', '进阶实战']);
  expect(
    finalDetail.chapters
      .filter((chapter) => chapter.status === 'canceled')
      .every((c) => c.attempt === 0),
  ).toBe(true);
  expect(finalDetail.chapters.filter((chapter) => chapter.status === 'succeeded')).toHaveLength(1);

  await expect(page.getByText('已取消').first()).toBeVisible();
  await expect(page.getByRole('button', { name: '重试章节 进阶实战' })).toBeVisible();
  await cleanupKnowledgeBase(request, tutorialId);
});
