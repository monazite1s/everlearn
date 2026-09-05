/**
 * @fileoverview 执行单章研究、撰写与终态回写（失败不阻塞他章）。
 */

import { completeLlm, WorkflowApiError } from '../workflows/workflow-api-client';
import { completeTutorialChapter } from './tutorial-api-client';
import type { TutorialExecutorConfig } from './tutorial-api-client';
import { buildChapterPrompt } from './tutorial-research';
import type { TutorialWebSearchProvider } from './tutorial-research';

/** 章节领取条目（与内部端点返回同构）。 */
export interface ChapterItem {
  readonly attempt: number;
  readonly chapterId: string;
  readonly documentId: string;
  readonly kbTexts: readonly string[];
  readonly level: number;
  readonly sessionTopic: string;
  readonly summary: string;
  readonly title: string;
}

/** 章节终态回写请求。 */
export interface ChapterCompletion {
  readonly errorCode?: string;
  readonly markdown?: string;
  readonly status: 'completed' | 'failed';
}

/** 执行章节生成所需的外部依赖。 */
export interface TutorialChapterExecutorDeps {
  /** 终态回写，默认经内部端点调用 API。 */
  readonly complete: (input: ChapterCompletion) => Promise<void>;
  readonly llm: (prompt: string) => Promise<string>;
  readonly search?: TutorialWebSearchProvider;
}

/** 用于按运行配置构造默认执行依赖。 */
export function createChapterDeps(
  config: TutorialExecutorConfig,
  chapterId: string,
): TutorialChapterExecutorDeps {
  return {
    /** 用于把运行终态经内部端点回写 API。 */
    complete: (input) => completeTutorialChapter(config, chapterId, input),
    llm: readLlmText(config),
  };
}

/** 用于执行一次章节生成：研究（可选）→ LLM 撰写 → 终态回写。 */
export async function executeTutorialChapter(
  item: ChapterItem,
  deps: TutorialChapterExecutorDeps,
): Promise<void> {
  try {
    const researchNotes = await researchChapter(item, deps);
    const markdown = await writeChapter(item, researchNotes, deps);
    await deps.complete({ markdown, status: 'completed' });
  } catch (error: unknown) {
    await deps.complete({
      errorCode: error instanceof WorkflowApiError ? error.errorCode : 'TUTORIAL_CHAPTER_FAILED',
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

/** 用于检索与章节主题相关的 Web 片段（未配置搜索时返回空）。 */
async function researchChapter(
  item: ChapterItem,
  deps: TutorialChapterExecutorDeps,
): Promise<string> {
  if (deps.search === undefined) return '';
  const results = await deps.search.search({
    maxResults: 3,
    query: `${item.sessionTopic} ${item.title}`,
  });
  return results
    .map((result, index) => `[${index + 1}] ${result.title}：${result.snippet}（${result.url}）`)
    .join('\n');
}

/** 用于构造章节撰写提示词并调用 LLM 校验非空。 */
async function writeChapter(
  item: ChapterItem,
  researchNotes: string,
  deps: TutorialChapterExecutorDeps,
): Promise<string> {
  const prompt = buildChapterPrompt({
    kbTexts: item.kbTexts,
    level: item.level,
    researchNotes,
    summary: item.summary,
    title: item.title,
    topic: item.sessionTopic,
  });
  const text = await deps.llm(prompt);
  if (text.trim().length === 0) {
    throw new WorkflowApiError('TUTORIAL_CHAPTER_EMPTY', 'chapter llm returned empty content');
  }
  return text;
}
