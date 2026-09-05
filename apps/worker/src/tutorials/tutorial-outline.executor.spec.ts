/**
 * @fileoverview 验证大纲执行器的降级、重试与终态回写。
 */

import { describe, expect, test } from 'vitest';

import { executeTutorialOutline } from './tutorial-outline.executor';
import type { OutlineCompletion, OutlineSessionItem } from './tutorial-outline.executor';

/** 用于构造最小大纲会话条目。 */
function createItem(): OutlineSessionItem {
  return {
    audience: '工程师',
    depth: 'standard',
    excludeTopics: [],
    goals: '',
    includeTopics: [],
    kbTexts: ['知识库文本'],
    level: 50,
    sessionId: 'session-1',
    topic: 'Kysely 入门',
  };
}

/** 用于构造固定大纲 JSON 输出。 */
const OUTLINE_JSON = '{"chapters":[{"nodeKey":"a","title":"A","summary":"s","dependsOn":[]}]}';

/** 用于构造捕获提示词与终态的依赖集合。 */
function createHarness(options: { llmOutput: string }) {
  const completions: OutlineCompletion[] = [];
  const prompts: string[] = [];
  const deps = {
    /** 用于记录大纲终态回写。 */
    complete: (input: OutlineCompletion): Promise<void> => {
      completions.push(input);
      return Promise.resolve();
    },
    /** 用于记录提示词并返回固定输出。 */
    llm: (prompt: string): Promise<string> => {
      prompts.push(prompt);
      return Promise.resolve(options.llmOutput);
    },
  };
  return { completions, deps, prompts };
}

import type { TutorialOutlineExecutorDeps } from './tutorial-outline.executor';

/** 用于构造固定返回的搜索依赖。 */
function createSearchDeps(
  deps: TutorialOutlineExecutorDeps,
  searched: string[],
): TutorialOutlineExecutorDeps {
  return {
    ...deps,
    search: {
      /** 用于记录查询并返回单条结果。 */
      search: (request: {
        query: string;
      }): Promise<
        readonly { publishedAt: null; snippet: string; title: string; url: string }[]
      > => {
        searched.push(request.query);
        return Promise.resolve([
          { publishedAt: null, snippet: '片段', title: 'T', url: 'https://a' },
        ]);
      },
    },
  };
}

describe('tutorial-outline executor', () => {
  test('未配置搜索时降级为仅知识库并登记 warning', async () => {
    const { completions, deps, prompts } = createHarness({ llmOutput: OUTLINE_JSON });
    await executeTutorialOutline(createItem(), deps);
    expect(completions).toHaveLength(1);
    expect(completions[0]!.status).toBe('completed');
    expect(completions[0]!.warnings![0]).toContain('web_search_unavailable');
    expect(prompts[0]).toContain('仅依据知识库资料');
  });

  test('搜索可用时按主题与覆盖词查询且无 warning', async () => {
    const searched: string[] = [];
    const { completions, deps, prompts } = createHarness({ llmOutput: OUTLINE_JSON });
    await executeTutorialOutline(
      { ...createItem(), includeTopics: ['迁移'] },
      createSearchDeps(deps, searched),
    );
    expect(searched).toEqual(['Kysely 入门', '迁移']);
    expect(prompts[0]).toContain('片段');
    expect(completions[0]!.warnings).toHaveLength(0);
  });

  test('无效 JSON 重试一次后仍失败则终态 failed', async () => {
    const { completions, deps, prompts } = createHarness({ llmOutput: 'not-json' });
    await executeTutorialOutline(createItem(), deps);
    expect(prompts).toHaveLength(2);
    expect(completions[0]!.status).toBe('failed');
    expect(completions[0]!.errorCode).toBe('TUTORIAL_OUTLINE_INVALID');
  });
});
