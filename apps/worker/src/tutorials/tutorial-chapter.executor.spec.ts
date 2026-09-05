/**
 * @fileoverview 验证章节执行器的引用占位符检测、重试与警告落稿。
 */

import { describe, expect, test } from 'vitest';

import { executeTutorialChapter } from './tutorial-chapter.executor';
import type { ChapterCompletion, ChapterItem } from './tutorial-chapter.executor';
import type { TutorialChapterExecutorDeps } from './tutorial-chapter.executor';

/** 用于构造最小章节领取条目。 */
function createItem(): ChapterItem {
  return {
    attempt: 1,
    chapterId: 'chapter-1',
    documentId: 'doc-1',
    kbTexts: ['知识库文本'],
    level: 50,
    sessionTopic: 'Kysely 入门',
    summary: '章节目标',
    title: '第一章',
  };
}

/** 用于按输出序列记录提示词与终态的依赖集合。 */
function createHarness(outputs: string[]) {
  const completions: ChapterCompletion[] = [];
  const prompts: string[] = [];
  const deps: TutorialChapterExecutorDeps = {
    /** 用于记录章节终态回写。 */
    complete: (input) => {
      completions.push(input);
      return Promise.resolve();
    },
    /** 用于记录提示词并按序列返回固定输出。 */
    llm: (prompt) => {
      prompts.push(prompt);
      return Promise.resolve(outputs[Math.min(prompts.length - 1, outputs.length - 1)]!);
    },
  };
  return { completions, deps, prompts };
}

describe('tutorial-chapter executor', () => {
  test('撰写提示词明确禁止字面 [n] 占位符', async () => {
    const { completions, deps, prompts } = createHarness(['正文 [1] 完成。']);
    await executeTutorialChapter(createItem(), deps);
    expect(prompts[0]).toContain('禁止输出字面 [n] 占位符');
    expect(prompts[0]).toContain('## 参考来源');
    expect(completions[0]).toEqual({ markdown: '正文 [1] 完成。', status: 'completed' });
  });

  test('首轮含 [n] 占位符时重试一次，干净稿直接落稿', async () => {
    const { completions, deps, prompts } = createHarness(['正文 [n] 占位。', '正文 [1] 完成。']);
    await executeTutorialChapter(createItem(), deps);
    expect(prompts).toHaveLength(2);
    expect(completions[0]!.status).toBe('completed');
    expect(completions[0]!.markdown).toBe('正文 [1] 完成。');
  });

  test('重试仍含 [n] 占位符时带警告落稿且不阻断', async () => {
    const { completions, deps, prompts } = createHarness(['正文 [n]。', '仍含 [ n ]。']);
    await executeTutorialChapter(createItem(), deps);
    expect(prompts).toHaveLength(2);
    expect(completions[0]!.status).toBe('completed');
    expect(completions[0]!.markdown).toContain('仍含 [ n ]。');
    expect(completions[0]!.markdown).toContain('请人工修订引用编号');
  });

  test('空输出终态 failed 并携带稳定错误码', async () => {
    const { completions, deps } = createHarness(['   ']);
    await executeTutorialChapter(createItem(), deps);
    expect(completions[0]).toEqual({
      errorCode: 'TUTORIAL_CHAPTER_EMPTY',
      status: 'failed',
    });
  });
});
