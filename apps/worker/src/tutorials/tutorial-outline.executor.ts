/**
 * @fileoverview 执行单次教程研究并生成结构化大纲（Web 不可用时降级为仅知识库范围）。
 */

import { completeLlm, WorkflowApiError } from '../workflows/workflow-api-client';
import { completeTutorialOutline } from './tutorial-api-client';
import type { TutorialExecutorConfig } from './tutorial-api-client';
import { buildOutlinePrompt, buildResearchQueries, parseOutlineJson } from './tutorial-research';
import type { TutorialWebSearchProvider } from './tutorial-research';

/** 大纲会话领取条目（与内部端点返回同构）。 */
export interface OutlineSessionItem {
  readonly audience: string;
  readonly depth: string;
  readonly excludeTopics: readonly string[];
  readonly goals: string;
  readonly includeTopics: readonly string[];
  readonly kbTexts: readonly string[];
  readonly level: number;
  readonly sessionId: string;
  readonly topic: string;
}

/** 大纲终态回写请求。 */
export interface OutlineCompletion {
  readonly errorCode?: string;
  readonly outline?: { chapters: unknown[] };
  readonly warnings?: readonly string[];
  readonly status: 'completed' | 'failed';
}

/** 执行大纲研究所需的外部依赖。 */
export interface TutorialOutlineExecutorDeps {
  /** 终态回写，默认经内部端点调用 API。 */
  readonly complete: (input: OutlineCompletion) => Promise<void>;
  readonly llm: (prompt: string) => Promise<string>;
  readonly search?: TutorialWebSearchProvider;
}

/** 用于按运行配置构造默认执行依赖。 */
export function createOutlineDeps(
  config: TutorialExecutorConfig,
  sessionId: string,
): TutorialOutlineExecutorDeps {
  return {
    /** 用于把运行终态经内部端点回写 API。 */
    complete: (input) => completeTutorialOutline(config, sessionId, input),
    llm: readLlmText(config),
  };
}

/** 用于执行一次大纲研究：搜索（可选）→ LLM → 终态回写。 */
export async function executeTutorialOutline(
  item: OutlineSessionItem,
  deps: TutorialOutlineExecutorDeps,
): Promise<void> {
  try {
    const { notes, warnings } = await research(item, deps);
    const outline = await generateOutline(item, notes, deps);
    await deps.complete({ outline, status: 'completed', warnings });
  } catch (error: unknown) {
    await deps.complete({
      errorCode: error instanceof WorkflowApiError ? error.errorCode : 'TUTORIAL_OUTLINE_FAILED',
      status: 'failed',
    });
  }
}

/** 用于构造经内部 LLM 动作输出纯文本的依赖。 */
function readLlmText(config: TutorialExecutorConfig): (prompt: string) => Promise<string> {
  return async (prompt: string) => {
    const result = await completeLlm(config, prompt);
    if (result.content === undefined) {
      throw new WorkflowApiError('TUTORIAL_LLM_EMPTY', 'llm action returned no content');
    }
    return result.content;
  };
}

/** 用于执行可选 Web 研究并汇总研究笔记与降级告警。 */
async function research(
  item: OutlineSessionItem,
  deps: TutorialOutlineExecutorDeps,
): Promise<{ notes: string; warnings: string[] }> {
  if (deps.search === undefined) {
    return {
      notes: '',
      warnings: ['web_search_unavailable: Web 研究未配置，已降级为仅知识库范围。'],
    };
  }
  const queries = buildResearchQueries(item.topic, item.includeTopics);
  const sections: string[] = [];
  for (const [index, query] of queries.entries()) {
    const results = await deps.search.search({ maxResults: 3, query });
    for (const [position, result] of results.entries()) {
      sections.push(
        `[${index + 1}.${position + 1}] ${result.title}：${result.snippet}（${result.url}）`,
      );
    }
  }
  return { notes: sections.join('\n'), warnings: [] };
}

/** 用于调用 LLM（一次重试）生成并解析大纲。 */
async function generateOutline(
  item: OutlineSessionItem,
  researchNotes: string,
  deps: TutorialOutlineExecutorDeps,
): Promise<{ chapters: unknown[] }> {
  const prompt = buildOutlinePrompt({ ...item, researchNotes });
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const parsed = parseOutlineJson(await deps.llm(prompt));
      if (parsed !== null) return parsed as { chapters: unknown[] };
      lastError = new WorkflowApiError(
        'TUTORIAL_OUTLINE_INVALID',
        'outline output is not valid JSON',
      );
    } catch (error: unknown) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('outline generation failed');
}
