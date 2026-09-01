/**
 * @fileoverview 执行单次资讯简报：抓取、过滤、生成中文简报并写入资讯知识库。
 */

import { completeLlm, createDocument, WorkflowApiError } from '../workflows/workflow-api-client';
import { completeNewsDigest, toNewsErrorCode } from './news-api-client';
import { fetchFeedItems, selectNewItems } from './news-feed';
import type { NewsDigestDispatchItem } from './news-api-client';

const MAX_ITEMS = 8;

/** 简报执行所需的外部配置。 */
export interface NewsDigestExecutorConfig {
  readonly apiInternalUrl: string;
  readonly secret: string;
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

/** 用于执行一次简报运行并把终态与已见条目回写 API。 */
export async function executeNewsDigest(
  item: NewsDigestDispatchItem,
  config: NewsDigestExecutorConfig,
): Promise<void> {
  try {
    const items = await fetchFeedItems(item.subscription.feedUrl);
    const selected = selectNewItems({
      excludeKeywords: item.subscription.excludeKeywords,
      includeKeywords: item.subscription.includeKeywords,
      items,
      limit: MAX_ITEMS,
      seenHashes: item.seenHashes,
    });
    const brief = await generateBrief(selected, item, config);
    await completeNewsDigest(config, item.runId, {
      briefDocumentId: brief,
      seenItems: selected.map((entry) => ({
        contentHash: entry.contentHash,
        normalizedUrl: entry.normalizedUrl,
      })),
      status: 'succeeded',
    });
  } catch (error: unknown) {
    await completeNewsDigest(config, item.runId, {
      errorCode: toNewsErrorCode(error),
      status: 'failed',
    });
  }
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
