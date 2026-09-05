/**
 * @fileoverview 实现单次 LLM 调用的订阅主题相关性、重要性与中文摘要三合一批量判定及失败降级。
 */

import { completeLlm } from '../workflows/workflow-api-client';
import { extractJsonObject } from '../tutorials/json-extraction';

/** 条目重要性的合法评级。 */
type Rating = 'high' | 'low' | 'normal';

/** 三合一判定的输入集合。 */
export interface DigestJudgeInput {
  /** 同订阅近期条目标题，供相对重要性对照。 */
  readonly recentItemTitles: readonly string[];
  readonly entries: readonly {
    readonly item: { readonly summary: string; readonly title: string };
  }[];
  readonly runId: string;
  readonly secret: string;
  readonly apiInternalUrl: string;
  /** 订阅自身的自然语言主题。 */
  readonly topic: string;
}

/** 三合一判定结果：保留索引、重要性评级、中文摘要与可选失败警告。 */
export interface DigestJudgeResult {
  readonly importanceByIndex: ReadonlyMap<number, Rating>;
  readonly keepIndexes: ReadonlySet<number>;
  readonly summaryByIndex: ReadonlyMap<number, string>;
  readonly warning: string | null;
}

/** 用于构造相关性、重要性与中文摘要三合一判定的提示词。 */
function buildJudgePrompt(topic: string, input: DigestJudgeInput): string {
  const lines = input.entries.map(
    (entry, index) => `${index}. ${entry.item.title}\n${entry.item.summary}`,
  );
  return [
    `订阅主题是「${topic}」。请对以下每条资讯完成三件事：`,
    '1. 判断与主题的相关性（keep 为 true 或 false）；',
    '2. 相对该订阅近期条目评定重要性（high、normal 或 low）；',
    '3. 写一句不超过 120 字的中文摘要，概括该条资讯的核心事实。',
    input.recentItemTitles.length > 0
      ? `近期条目标题（作为重要性对照基线）：\n${input.recentItemTitles.join('\n')}`
      : '暂无近期条目，请按主题本身的重要性评定。',
    '只输出 JSON 本身，格式为 {"items":[{"index":条目编号,"keep":true,"importance":"high|normal|low","summary":"中文一句话摘要"}]}，不要使用 Markdown 代码围栏，不要输出其他内容。',
    '',
    lines.join('\n'),
  ].join('\n');
}

/** 单条判定输出的中间形态。 */
interface JudgeEntry {
  importance: unknown;
  index: number;
  keep: unknown;
  summary: unknown;
}

/** 用于判断单条判定输出结构是否合法。 */
function isJudgeEntry(entry: unknown, total: number): entry is JudgeEntry {
  if (typeof entry !== 'object' || entry === null) return false;
  const record = entry as { index?: unknown };
  return (
    Number.isInteger(record.index) &&
    (record.index as number) >= 0 &&
    (record.index as number) < total
  );
}

/** 用于把单条判定输出并入三合一结果集合，字段缺失时按降级语义跳过。 */
function collectJudgeEntry(
  entry: JudgeEntry,
  target: { importance: Map<number, Rating>; keep: Set<number>; summaries: Map<number, string> },
): void {
  if (entry.keep === true) target.keep.add(entry.index);
  if (entry.importance === 'high' || entry.importance === 'normal' || entry.importance === 'low') {
    target.importance.set(entry.index, entry.importance);
  }
  if (typeof entry.summary === 'string' && entry.summary.length > 0) {
    target.summaries.set(entry.index, entry.summary);
  }
}

/** 用于把三合一判定输出解析为保留索引、重要性映射与摘要映射，无法解析时返回 null。 */
export function parseJudgeResult(
  text: string,
  total: number,
): {
  importance: Map<number, Rating>;
  keep: ReadonlySet<number>;
  summaries: Map<number, string>;
} | null {
  const parsed = extractJsonObject(text) as { items?: unknown } | null;
  if (parsed === null || !Array.isArray(parsed.items) || parsed.items.length === 0) return null;
  const collected = {
    importance: new Map<number, Rating>(),
    keep: new Set<number>(),
    summaries: new Map<number, string>(),
  };
  for (const entry of parsed.items) {
    if (isJudgeEntry(entry, total)) collectJudgeEntry(entry, collected);
  }
  if (
    collected.keep.size === 0 &&
    collected.importance.size === 0 &&
    collected.summaries.size === 0
  ) {
    return null;
  }
  return collected;
}

/** 用于在三合一判定失败时构造全保留降级结果。 */
function degradedResult(total: number, warning: string): DigestJudgeResult {
  return {
    importanceByIndex: new Map(),
    keepIndexes: new Set(Array.from({ length: total }, (_, index) => index)),
    summaryByIndex: new Map(),
    warning,
  };
}

/** 用于执行一次三合一判定，任何失败都降级为全保留、普通重要性与空摘要并给出警告。 */
export async function judgeNewsDigest(input: DigestJudgeInput): Promise<DigestJudgeResult> {
  try {
    const result = await completeLlm(
      { apiInternalUrl: input.apiInternalUrl, secret: input.secret },
      buildJudgePrompt(input.topic, input),
    );
    const content = result.content ?? '';
    const parsed = parseJudgeResult(content, input.entries.length);
    if (parsed === null) {
      return degradedResult(
        input.entries.length,
        '相关性判定输出无法解析，已保留全部候选并按普通重要性处理',
      );
    }
    return {
      importanceByIndex: parsed.importance,
      keepIndexes: parsed.keep,
      summaryByIndex: parsed.summaries,
      warning: null,
    };
  } catch {
    return degradedResult(input.entries.length, '相关性判定失败，已保留全部候选并按普通重要性处理');
  }
}
