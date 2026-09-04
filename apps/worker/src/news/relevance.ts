/**
 * @fileoverview 实现一次 LLM 调用的批量来源相关性判定与失败降级。
 */

import { completeLlm } from '../workflows/workflow-api-client';

/** 相关性判定的输入集合。 */
export interface RelevanceJudgeInput {
  readonly entries: readonly {
    readonly item: { readonly summary: string; readonly title: string };
  }[];
  readonly runId: string;
  readonly secret: string;
  readonly apiInternalUrl: string;
}

/** 判定结果：保留索引与可选的失败警告。 */
export interface RelevanceJudgeResult {
  readonly keepIndexes: ReadonlySet<number>;
  readonly warning: string | null;
}

/** 用于构造相关性判定提示词。 */
function buildJudgePrompt(entries: RelevanceJudgeInput['entries']): string {
  const lines = entries.map(
    (entry, index) => `${index}. ${entry.item.title}\n${entry.item.summary}`,
  );
  return [
    '请判断以下每条资讯与「技术学习与知识管理」主题的相关性。',
    '只输出 JSON，格式为 {"keep":[相关条目的编号]}，不要输出其他内容。',
    '',
    lines.join('\n'),
  ].join('\n');
}

/** 用于从模型输出解析保留索引，无法解析时返回 null。 */
function parseKeepIndexes(text: string, total: number): Set<number> | null {
  const match = /\{[\s\S]*\}/.exec(text);
  if (match === null) return null;
  try {
    const parsed = JSON.parse(match[0]) as { keep?: unknown };
    if (!Array.isArray(parsed.keep)) return null;
    const indexes = new Set<number>();
    for (const value of parsed.keep) {
      const index = typeof value === 'number' ? value : Number(value);
      if (Number.isInteger(index) && index >= 0 && index < total) indexes.add(index);
    }
    return indexes;
  } catch {
    return null;
  }
}

/** 用于执行一次相关性判定，任何失败都降级为保留全部并给出警告。 */
export async function judgeRelevance(input: RelevanceJudgeInput): Promise<RelevanceJudgeResult> {
  try {
    const result = await completeLlm(
      { apiInternalUrl: input.apiInternalUrl, secret: input.secret },
      buildJudgePrompt(input.entries),
    );
    const content = result.content ?? '';
    const keepIndexes = parseKeepIndexes(content, input.entries.length);
    if (keepIndexes === null) {
      return {
        keepIndexes: new Set(input.entries.map((_, index) => index)),
        warning: '相关性判定输出无法解析，已保留全部候选',
      };
    }
    return { keepIndexes, warning: null };
  } catch {
    return {
      keepIndexes: new Set(input.entries.map((_, index) => index)),
      warning: '相关性判定失败，已保留全部候选',
    };
  }
}
