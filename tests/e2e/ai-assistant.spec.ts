/** @fileoverview 在真实 API、Worker 与可控 mock LLM 上验收 AI 问答引用与草稿接受/放弃门禁。 */

import { randomUUID } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import {
  MOCK_DRAFT_TEXT,
  MOCK_QA_ANSWER,
  releaseE2eEnvironment,
  setMockQaCitations,
  startE2eEnvironment,
} from './environment';
import {
  saveDocumentContent,
  seedDocument,
  seedKnowledgeBase,
  waitForSearchResults,
} from './seed-helpers';

let knowledgeBaseId = '';
let documentId = '';
let blockId = '';

/** 用于打开文档编辑页并展开 AI 助手到指定页签。 */
async function openAiTab(page: Page, tabName: string): Promise<void> {
  await page.setViewportSize({ height: 900, width: 1440 });
  await page.goto(`/knowledge/${knowledgeBaseId}/documents/${documentId}`);
  await expect(page.getByRole('button', { name: '打开 AI 助手' })).toBeVisible();
  await page.getByRole('button', { name: '打开 AI 助手' }).click();
  await page.getByRole('tab', { name: tabName }).click();
}

/** 用于统计文档当前修订数量。 */
async function countRevisions(request: Page['request']): Promise<number> {
  const response = await request.get(`/api/v1/documents/${documentId}/revisions`);
  const body = (await response.json()) as { items?: unknown[] };
  return Array.isArray(body.items) ? body.items.length : 0;
}

test.beforeAll(async ({ request }) => {
  await startE2eEnvironment();
  knowledgeBaseId = await seedKnowledgeBase(request, 'AI 验收知识库');
  documentId = await seedDocument(request, knowledgeBaseId, 'AI 验收文档');
  blockId = randomUUID();
  await saveDocumentContent(request, documentId, {
    content: [
      {
        attrs: { blockId },
        content: [{ text: 'transactional needle content', type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  });
  setMockQaCitations([{ blockId, documentId }]);
});

test.afterAll(async () => {
  await releaseE2eEnvironment();
});

test('answers a question with citations and navigates to the cited document', async ({ page }) => {
  // 投影收敛轮询可能超过默认 30 秒用例预算。
  test.setTimeout(90_000);
  await openAiTab(page, '知识库问答');
  // 无变更打开不再触发自动保存，版本恒等于索引，直接等投影收敛后提问。
  await waitForSearchResults(page.request, { knowledgeBaseId, minItems: 1, text: 'needle' });
  // 自然中文混排问句，验证 OR 词素召回不再依赖全英文单词提问。
  await page.getByLabel('问题').fill('transactional needle 用在哪里？');
  await page.getByRole('button', { name: '提问' }).click();
  await expect(page.getByText(MOCK_QA_ANSWER)).toBeVisible();
  const citation = page.getByRole('link', { name: '引用 1' });
  await expect(citation).toBeVisible();
  await citation.click();
  await expect(page).toHaveURL(new RegExp(`/knowledge/${knowledgeBaseId}/documents/${documentId}`));
});

test('streams a draft, accepts it, and records a new revision', async ({ page }) => {
  await openAiTab(page, '生成草稿');
  await page.getByLabel('生成指令').fill('为本文写一段总结。');
  await page.getByRole('button', { name: '生成草稿' }).click();
  await expect(page.getByText(MOCK_DRAFT_TEXT).first()).toBeVisible();
  await page.getByRole('button', { name: '接受并替换正文' }).click();
  // 服务端正文最终包含草稿文本（自动保存可能重试，轮询至落库）。
  await expect
    .poll(async () => {
      const response = await page.request.get(`/api/v1/documents/${documentId}/content`);
      const body = (await response.json()) as { contentJson?: unknown };
      return JSON.stringify(body.contentJson ?? {}).includes(MOCK_DRAFT_TEXT);
    })
    .toBe(true);
  // 修订快照在继续编辑后的离开时刻由会话卸载触发提交。
  await page.locator('.ProseMirror').click();
  await page.keyboard.type(' 接受后追加修订文字');
  const revisionPosted = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/documents/${documentId}/revisions`) &&
      response.request().method() === 'POST',
  );
  // 通过应用内链接离开，确保会话卸载触发修订快照提交。
  await page.getByRole('link', { name: '知识库' }).first().click();
  await revisionPosted;
  expect(await countRevisions(page.request)).toBeGreaterThanOrEqual(2);
});

test('discards a draft and keeps the document body unchanged', async ({ page }) => {
  await openAiTab(page, '生成草稿');
  await page.getByLabel('生成指令').fill('再生成一版。');
  await page.getByRole('button', { name: '生成草稿' }).click();
  await expect(page.getByText(MOCK_DRAFT_TEXT).first()).toBeVisible();
  const revisionsBefore = await countRevisions(page.request);
  await page.getByRole('button', { name: '放弃' }).click();
  await expect(page.getByRole('button', { name: '接受并替换正文' })).toBeHidden();
  // 放弃后仅剩编辑器中上一次接受的草稿文本，预览已清空且不产生新修订。
  await expect(page.getByText(MOCK_DRAFT_TEXT)).toHaveCount(1);
  expect(await countRevisions(page.request)).toBe(revisionsBefore);
});

test('shows an actionable error when the model is unavailable', async ({ page }) => {
  // 投影收敛轮询可能超过默认 30 秒用例预算。
  test.setTimeout(60_000);
  const runtime = await startE2eEnvironment();
  await runtime.killMockLlm();
  // 草稿生成直接连接模型，不经过问答召回，可稳定验证模型不可用的可行动错误。
  await openAiTab(page, '生成草稿');
  await page.getByLabel('生成指令').fill('为本文写一段总结。');
  await page.getByRole('button', { name: '生成草稿' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('请');
  // 模型不可用只呈现可行动错误，应用壳与编辑器会话保持可用。
  await expect(page.getByRole('heading', { name: 'AI 助手' })).toBeVisible();
});
