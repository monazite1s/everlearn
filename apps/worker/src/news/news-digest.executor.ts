/**
 * @fileoverview 执行单次资讯简报：抓取、过滤、相关性判定、生成中文简报并写入资讯知识库。
 */

import { completeLlm, createDocument, WorkflowApiError } from '../workflows/workflow-api-client';
import { assertFetchableFeedUrl } from './url-guard';
import {
  completeNewsDigest,
  registerNewsRunItems,
  toNewsErrorCode,
  type NewsSourceResultPayload,
} from './news-api-client';
import { fetchFeedItems, selectNewItems } from './news-feed';
import type { FeedItem } from './news-feed';
import { collectSearchEntries } from './news-search';
import { judgeNewsDigest } from './relevance';
import type { NewsDigestDispatchItem } from './news-api-client';

const MAX_ITEMS = 8;
const MIN_ADOPTED_FOR_QUALITY = 3;
const SUMMARY_LIMIT = 120;

/** 简报执行所需的外部配置。 */
export interface NewsDigestExecutorConfig {
  readonly apiInternalUrl: string;
  readonly secret: string;
  /** 仅测试夹具可置真：跳过 feed 主机的私网地址校验。 */
  readonly allowPrivateFeedUrls?: boolean;
}

/** 用于构造生成中文简报的提示词。 */
function buildPrompt(entries: readonly { item: FeedItem }[]): string {
  const sections = entries
    .map(
      (entry, index) =>
        `${index + 1}. ${entry.item.title}\n链接：${entry.item.link}\n摘要：${entry.item.summary}`,
    )
    .join('\n\n');
  return [
    '请基于以下资讯条目生成一份中文简报，要求仅依据所给条目，不得引入外部信息。',
    '输出为 Markdown：先一段总述，再为每条输出一组要点并附原文链接。',
    '',
    sections,
  ].join('\n');
}

/** 用于创建「资讯简报生成失败说明」文档并返回其 id。 */
async function createFailureExplainDocument(
  step: string,
  reason: string,
  item: NewsDigestDispatchItem,
  config: NewsDigestExecutorConfig,
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const plainText = [
    '> ⚠️ 本期资讯简报生成失败，以下为失败说明。',
    `> 失败步骤：${step}`,
    `> 失败原因：${reason}`,
    '',
    '本期未生成资讯简报正文，请检查资讯源后重试。',
  ].join('\n');
  const created = await createDocument(config, {
    knowledgeBaseId: item.subscription.newsKnowledgeBaseId,
    nodeId: 'news-digest-brief',
    plainText,
    runId: item.runId,
    title: `资讯简报生成失败说明 ${today}`,
  });
  if (created.documentId === undefined) {
    throw new WorkflowApiError('NEWS_DOC_CREATE_FAILED', 'doc-create returned no documentId');
  }
  return created.documentId;
}

/** 用于执行一次简报运行并把终态、警告与来源决策回写 API。 */
export async function executeNewsDigest(
  item: NewsDigestDispatchItem,
  config: NewsDigestExecutorConfig,
): Promise<void> {
  const collected = await collectFromSources(item, config);
  if (collected.entries === null) {
    await completeFailureExplain(item, config, collected.failure);
    return;
  }
  await runDigestPipeline(collected.entries, item, config, collected.warnings);
}

/** 多来源采集的中间结果。 */
type SourceCollection =
  | { entries: null; failure: unknown; warnings: string[] }
  | { entries: FeedItem[]; warnings: string[] };

/** 用于遍历订阅来源采集条目，单来源失败不阻塞其他来源。 */
async function collectFromSources(
  item: NewsDigestDispatchItem,
  config: NewsDigestExecutorConfig,
): Promise<SourceCollection> {
  const warnings: string[] = [];
  const entries: FeedItem[] = [];
  let failure: unknown = new Error('订阅未配置任何来源');
  for (const source of item.subscription.sources) {
    try {
      if (source.type === 'search') {
        entries.push(
          ...(await collectSearchEntries(config, {
            includeKeywords: item.subscription.includeKeywords,
            topic: item.subscription.topic,
          })),
        );
        continue;
      }
      if (config.allowPrivateFeedUrls !== true) await assertFetchableFeedUrl(source.value);
      entries.push(...(await fetchFeedItems(source.value)));
    } catch (error: unknown) {
      failure = error;
      const reason = error instanceof Error ? error.message : String(error);
      warnings.push(`来源 ${source.value} 抓取失败：${reason.slice(0, 200)}`);
    }
  }
  return entries.length === 0 ? { entries: null, failure, warnings } : { entries, warnings };
}

/** 用于把全来源失败收敛为失败说明文档与 succeeded 运行。 */
async function completeFailureExplain(
  item: NewsDigestDispatchItem,
  config: NewsDigestExecutorConfig,
  error: unknown,
): Promise<void> {
  try {
    const reason = error instanceof Error ? error.message : String(error);
    const briefDocumentId = await createFailureExplainDocument('资讯源抓取', reason, item, config);
    const warning = `资讯源抓取失败，已生成失败说明：${reason.slice(0, 200)}`;
    await completeNewsDigest(config, item.runId, {
      briefDocumentId,
      status: 'succeeded',
      warnings: [warning],
    });
  } catch (nested: unknown) {
    await completeNewsDigest(config, item.runId, {
      errorCode: toNewsErrorCode(nested),
      status: 'failed',
    });
  }
}

/** 抓取采纳后进入判定的条目形态。 */
export interface AdoptedEntry {
  readonly contentHash: string;
  readonly item: FeedItem;
  readonly normalizedUrl: string;
}

/** 携带判定前原始下标的入选条目，供评级与摘要按原下标记取。 */
export interface KeptEntry extends AdoptedEntry {
  readonly sourceIndex: number;
}

/** 三合一判定后的条目分组与逐条评级、摘要。 */
interface JudgedCollection {
  readonly importanceByIndex: ReadonlyMap<number, 'high' | 'low' | 'normal'>;
  readonly kept: KeptEntry[];
  readonly rejected: AdoptedEntry[];
  readonly summaryByIndex: ReadonlyMap<number, string>;
  readonly warnings: string[];
}

/** 用于执行三合一判定并产出携带原始下标的保留条目、被拒条目、评级、摘要与警告。 */
export async function judgeAndCollect(
  adopted: AdoptedEntry[],
  item: NewsDigestDispatchItem,
  config: NewsDigestExecutorConfig,
): Promise<JudgedCollection> {
  const judged = await judgeNewsDigest({
    apiInternalUrl: config.apiInternalUrl,
    entries: adopted,
    recentItemTitles: item.recentItemTitles,
    runId: item.runId,
    secret: config.secret,
    topic: item.subscription.topic,
  });
  const kept = adopted.flatMap((entry, index) =>
    judged.keepIndexes.has(index) ? [{ ...entry, sourceIndex: index }] : [],
  );
  const rejected = adopted.filter((_, index) => !judged.keepIndexes.has(index));
  const warnings = judged.warning === null ? [] : [judged.warning];
  if (kept.length > 0 && kept.length < MIN_ADOPTED_FOR_QUALITY) {
    warnings.push(`来源不足，简报仅基于 ${kept.length} 条来源`);
  }
  return {
    importanceByIndex: judged.importanceByIndex,
    kept,
    rejected,
    summaryByIndex: judged.summaryByIndex,
    warnings,
  };
}

/** 用于在发现新条目时登记资讯条目并返回指纹到条目 id 的映射。 */
async function registerAdoptedItems(
  adopted: AdoptedEntry[],
  item: NewsDigestDispatchItem,
  config: NewsDigestExecutorConfig,
): Promise<Map<string, string>> {
  const registered = await registerNewsRunItems(
    config,
    item.runId,
    adopted.map((entry) => ({
      contentFingerprint: entry.contentHash,
      publishedAt: entry.item.publishedAt ?? null,
      snippet: entry.item.summary,
      sourceType: entry.item.sourceType,
      title: entry.item.title,
      url: entry.normalizedUrl,
    })),
  );
  return new Map(registered.map((entry) => [entry.contentFingerprint, entry.id]));
}

/** 用于承载组装终态回写内容所需的已选条目集合。 */
export interface ItemResultInputs {
  readonly importanceByIndex: ReadonlyMap<number, 'high' | 'low' | 'normal'>;
  readonly itemIds: Map<string, string>;
  readonly kept: KeptEntry[];
  readonly rejected: {
    readonly contentHash: string;
    readonly item: FeedItem;
  }[];
  readonly skipped: { readonly item: FeedItem; readonly reason: string }[];
  readonly summaryByIndex: ReadonlyMap<number, string>;
}

/** 用于组装终态回写的条目级结果，评级与摘要按入选条目的原始下标记取。 */
export function buildItemResults(inputs: ItemResultInputs): {
  itemImportance: {
    importance: 'high' | 'low' | 'normal';
    itemId: string;
    processedContent?: string;
  }[];
  rejectedItemIds: string[];
  sourceResults: NewsSourceResultPayload[];
} {
  const { kept, rejected, skipped, itemIds, importanceByIndex, summaryByIndex } = inputs;
  /** 用于按内容指纹解析条目 id，未登记时返回空串。 */
  const itemIdOf = (entry: { contentHash: string }): string => itemIds.get(entry.contentHash) ?? '';
  return {
    itemImportance: kept
      .map((entry) => ({
        importance: importanceByIndex.get(entry.sourceIndex) ?? 'normal',
        itemId: itemIdOf(entry),
        ...(summaryByIndex.has(entry.sourceIndex)
          ? { processedContent: summaryByIndex.get(entry.sourceIndex)!.slice(0, SUMMARY_LIMIT) }
          : {}),
      }))
      .filter((entry) => entry.itemId !== ''),
    rejectedItemIds: rejected.map(itemIdOf).filter(Boolean),
    sourceResults: [
      ...kept.map((entry) => ({
        decision: 'adopted' as const,
        reason: '入选简报',
        title: entry.item.title,
        url: entry.item.link,
      })),
      ...rejected.map((entry) => ({
        decision: 'skipped' as const,
        reason: 'LLM 判定不相关',
        title: entry.item.title,
        url: entry.item.link,
      })),
      ...buildSkippedResults(skipped),
    ],
  };
}

/** 用于执行抓取成功后的登记、判定与简报生成主流程。 */
async function runDigestPipeline(
  items: readonly FeedItem[],
  item: NewsDigestDispatchItem,
  config: NewsDigestExecutorConfig,
  collectWarnings: readonly string[],
): Promise<void> {
  try {
    const { adopted, skipped } = selectNewItems({
      excludeKeywords: item.subscription.excludeKeywords,
      includeKeywords: item.subscription.includeKeywords,
      items,
      limit: MAX_ITEMS,
      seenHashes: item.seenHashes,
    });
    const itemIds = await registerAdoptedItems(adopted, item, config);
    const { importanceByIndex, kept, rejected, summaryByIndex, warnings } = await judgeAndCollect(
      adopted,
      item,
      config,
    );
    const brief = await generateBrief(kept, item, config);
    const { itemImportance, rejectedItemIds, sourceResults } = buildItemResults({
      importanceByIndex,
      itemIds,
      kept,
      rejected,
      skipped,
      summaryByIndex,
    });
    await completeNewsDigest(config, item.runId, {
      briefDocumentId: brief,
      itemImportance,
      rejectedItemIds,
      sourceResults,
      status: 'succeeded',
      warnings: [...collectWarnings, ...warnings],
    });
  } catch (error: unknown) {
    await completeNewsDigest(config, item.runId, {
      errorCode: toNewsErrorCode(error),
      status: 'failed',
    });
  }
}

/** 用于组装关键词过滤等预处理阶段的落选记录。 */
function buildSkippedResults(
  skipped: readonly { item: FeedItem; reason: string }[],
): NewsSourceResultPayload[] {
  return skipped.map((entry) => ({
    decision: 'skipped' as const,
    reason: entry.reason,
    title: entry.item.title,
    url: entry.item.link,
  }));
}

/** 用于调用 LLM 生成简报并在资讯知识库创建文档。 */
async function generateBrief(
  selected: {
    contentHash: string;
    item: FeedItem;
    normalizedUrl: string;
  }[],
  item: NewsDigestDispatchItem,
  config: NewsDigestExecutorConfig,
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);
  const title = `资讯简报 ${today}`;
  // ponytail: 无新条目时仍生成占位简报文档，简化空期态；升级条件为用户反馈空简报噪音。
  const plainText =
    selected.length === 0
      ? '本期没有新的资讯条目。'
      : await requestBriefText(buildPrompt(selected), item.runId, config);
  const created = await createDocument(config, {
    knowledgeBaseId: item.subscription.newsKnowledgeBaseId,
    nodeId: 'news-digest-brief',
    plainText,
    runId: item.runId,
    title,
  });
  if (created.documentId === undefined) {
    throw new WorkflowApiError('NEWS_DOC_CREATE_FAILED', 'doc-create returned no documentId');
  }
  return created.documentId;
}

/** 用于经内部 LLM 动作生成简报正文。 */
async function requestBriefText(
  prompt: string,
  runId: string,
  config: NewsDigestExecutorConfig,
): Promise<string> {
  try {
    const result = await completeLlm(config, prompt);
    if (result.content === undefined || result.content.length === 0) {
      throw new WorkflowApiError('NEWS_LLM_EMPTY', 'llm action returned empty content');
    }
    return result.content;
  } catch (error: unknown) {
    const code = error instanceof WorkflowApiError ? error.errorCode : 'NEWS_LLM_FAILED';
    throw new WorkflowApiError(code, `brief llm failed for run ${runId}`);
  }
}
