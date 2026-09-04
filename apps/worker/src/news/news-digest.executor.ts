/**
 * @fileoverview 执行单次资讯简报：抓取、过滤、相关性判定、生成中文简报并写入资讯知识库。
 */

import { completeLlm, createDocument, WorkflowApiError } from '../workflows/workflow-api-client';
import { assertFetchableFeedUrl } from './url-guard';
import {
  completeNewsDigest,
  toNewsErrorCode,
  type NewsSourceResultPayload,
} from './news-api-client';
import { fetchFeedItems, selectNewItems } from './news-feed';
import { judgeRelevance } from './relevance';
import type { NewsDigestDispatchItem } from './news-api-client';

const MAX_ITEMS = 8;
const MIN_ADOPTED_FOR_QUALITY = 3;

/** 简报执行所需的外部配置。 */
export interface NewsDigestExecutorConfig {
  readonly apiInternalUrl: string;
  readonly secret: string;
  /** 仅测试夹具可置真：跳过 feed 主机的私网地址校验。 */
  readonly allowPrivateFeedUrls?: boolean;
}

/** 用于构造生成中文简报的提示词。 */
function buildPrompt(
  entries: readonly { item: { link: string; summary: string; title: string } }[],
): string {
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
  let items: { link: string; summary: string; title: string }[];
  try {
    if (config.allowPrivateFeedUrls !== true)
      await assertFetchableFeedUrl(item.subscription.feedUrl);
    items = await fetchFeedItems(item.subscription.feedUrl);
  } catch (error: unknown) {
    await completeFailureExplain(item, config, error);
    return;
  }
  await runDigestPipeline(items, item, config);
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

/** 用于执行相关性判定并产出保留条目、决策记录与结构化警告。 */
async function judgeAndCollect(
  adopted: {
    contentHash: string;
    item: { link: string; summary: string; title: string };
    normalizedUrl: string;
  }[],
  sourceResults: NewsSourceResultPayload[],
  item: NewsDigestDispatchItem,
  config: NewsDigestExecutorConfig,
): Promise<{
  kept: typeof adopted;
  warnings: string[];
}> {
  const judged = await judgeRelevance({
    apiInternalUrl: config.apiInternalUrl,
    entries: adopted,
    runId: item.runId,
    secret: config.secret,
  });
  const kept = adopted.filter((_, index) => judged.keepIndexes.has(index));
  for (const [index, entry] of adopted.entries()) {
    if (!judged.keepIndexes.has(index)) {
      sourceResults.push({
        decision: 'skipped',
        reason: 'LLM 判定不相关',
        title: entry.item.title,
        url: entry.item.link,
      });
    }
  }
  const warnings = judged.warning === null ? [] : [judged.warning];
  if (kept.length > 0 && kept.length < MIN_ADOPTED_FOR_QUALITY) {
    warnings.push(`来源不足，简报仅基于 ${kept.length} 条来源`);
  }
  return { kept, warnings };
}

/** 用于执行抓取成功后的过滤、判定与简报生成主流程。 */
async function runDigestPipeline(
  items: { link: string; summary: string; title: string }[],
  item: NewsDigestDispatchItem,
  config: NewsDigestExecutorConfig,
): Promise<void> {
  try {
    const { adopted, skipped } = selectNewItems({
      excludeKeywords: item.subscription.excludeKeywords,
      includeKeywords: item.subscription.includeKeywords,
      items,
      limit: MAX_ITEMS,
      seenHashes: item.seenHashes,
    });
    const sourceResults = buildSourceResults(adopted, skipped);
    const { kept, warnings } = await judgeAndCollect(adopted, sourceResults, item, config);
    const brief = await generateBrief(kept, item, config);
    await completeNewsDigest(config, item.runId, {
      briefDocumentId: brief,
      seenItems: kept.map((entry) => ({
        contentHash: entry.contentHash,
        normalizedUrl: entry.normalizedUrl,
      })),
      sourceResults,
      status: 'succeeded',
      warnings,
    });
  } catch (error: unknown) {
    await completeNewsDigest(config, item.runId, {
      errorCode: toNewsErrorCode(error),
      status: 'failed',
    });
  }
}

/** 用于组装每条来源的决策记录。 */
function buildSourceResults(
  adopted: readonly { item: { link: string; summary: string; title: string } }[],
  skipped: readonly { item: { link: string; summary: string; title: string }; reason: string }[],
): NewsSourceResultPayload[] {
  return [
    ...adopted.map((entry) => ({
      decision: 'adopted' as const,
      reason: '入选简报',
      title: entry.item.title,
      url: entry.item.link,
    })),
    ...skipped.map((entry) => ({
      decision: 'skipped' as const,
      reason: entry.reason,
      title: entry.item.title,
      url: entry.item.link,
    })),
  ];
}

/** 用于调用 LLM 生成简报并在资讯知识库创建文档。 */
async function generateBrief(
  selected: {
    contentHash: string;
    item: { link: string; summary: string; title: string };
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
