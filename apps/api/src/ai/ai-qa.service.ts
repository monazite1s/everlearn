/**
 * @fileoverview 组合搜索召回、引用问答与非法引用过滤。
 */

import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '../database/database.service';
import { ApiDomainException } from '../http-boundary/api-domain.exception';
import { LocalIdentityContext } from '../identity/local-identity.context';
import type { HybridRecallRow } from '../search/search-query.store';
import { activeKnowledgeBaseExists, readHybridRecallRows } from '../search/search-query.store';
import type { EmbeddingProvider } from './embedding';
import { resolveEmbeddingProvider } from './embedding';
import { extractJsonObject } from './json-extraction';
import type { LlmMessage } from './llm-provider';
import { LlmGateway } from './llm-gateway';

/** 单次问答召回的候选块上限。 */
const QA_CANDIDATE_LIMIT = 8;

/** 带引用问答的公开响应形态。 */
export interface AiQaAnswer {
  readonly answer: string;
  readonly citations: readonly { readonly blockId: string; readonly documentId: string }[];
  readonly candidateCount: number;
  readonly retrievalMode: 'fts' | 'hybrid';
}

/** 携带候选块与用户问题的问答请求。 */
export interface AiQaRequest {
  readonly knowledgeBaseId: string;
  readonly question: string;
}

/** 用于返回不泄露知识库存在性的统一拒绝。 */
function notFound(): ApiDomainException {
  return new ApiDomainException({
    code: 'NOT_FOUND',
    kind: 'domain',
    message: '请求的知识库不存在或不可访问。',
    status: HttpStatus.NOT_FOUND,
  });
}

/** 用于生成要求仅依据候选回答并输出纯 JSON 的消息序列。 */
export function buildQaMessages(question: string, candidates: string): readonly LlmMessage[] {
  return [
    {
      content:
        '你是知识库问答助手。仅依据给定候选片段回答；输出严格 JSON：' +
        '{"answer":"string","citations":[{"documentId":"string","blockId":"string"}]}；' +
        '证据不足时 answer 明确说明未找到且 citations 为空数组，禁止编造引用。' +
        '只输出 JSON 本身，不要使用 Markdown 代码围栏，不要附加任何解释文字。',
      role: 'system',
    },
    { content: `候选片段：\n${candidates}\n\n问题：${question}`, role: 'user' },
  ];
}

/** 用于过滤不在候选集内的非法引用。 */
export function sanitizeCitations(
  parsed: { answer?: unknown; citations?: unknown },
  candidates: ReadonlyMap<string, string>,
): {
  readonly answer: string;
  readonly citations: { readonly blockId: string; readonly documentId: string }[];
} {
  const answer = typeof parsed.answer === 'string' ? parsed.answer : '';
  const rawCitations = Array.isArray(parsed.citations) ? parsed.citations : [];
  const citations = rawCitations.flatMap((item) => {
    const record = item as { blockId?: unknown; documentId?: unknown } | null;
    const documentId = typeof record?.documentId === 'string' ? record.documentId : '';
    const blockId = typeof record?.blockId === 'string' ? record.blockId : '';
    return candidates.get(`${documentId}\u0000${blockId}`) === documentId
      ? [{ blockId, documentId }]
      : [];
  });
  return { answer, citations };
}

/** 用于执行候选召回与引用校验的问答应用服务。 */
@Injectable()
export class AiQaService {
  /** 用于注入数据库、身份边界、LLM 网关与进程配置。 */
  constructor(
    private readonly database: DatabaseService,
    private readonly identity: LocalIdentityContext,
    private readonly gateway: LlmGateway,
    private readonly config: ConfigService<Record<string, string>, false>,
  ) {}

  /** 用于解析可选向量 Provider，未配置时返回 null 走 FTS 降级。 */
  private resolveQueryEmbeddingProvider(): EmbeddingProvider | null {
    return resolveEmbeddingProvider(this.config) ?? null;
  }

  /** 用于召回候选块并返回经过引用校验的答案。 */
  async answer(request: AiQaRequest): Promise<AiQaAnswer> {
    const ownerId = this.identity.getActor().ownerId;
    const exists = await activeKnowledgeBaseExists(
      this.database.client,
      ownerId,
      request.knowledgeBaseId,
    );
    if (!exists) throw notFound();
    const embeddingProvider = this.resolveQueryEmbeddingProvider();
    const queryEmbedding =
      embeddingProvider === null
        ? null
        : ((await embeddingProvider.embed([request.question]))[0] ?? null);
    const retrievalMode: AiQaAnswer['retrievalMode'] = queryEmbedding === null ? 'fts' : 'hybrid';
    const rows = await readHybridRecallRows(this.database.client, {
      knowledgeBaseId: request.knowledgeBaseId,
      limit: QA_CANDIDATE_LIMIT,
      ownerId,
      query: request.question,
      queryEmbedding,
    });
    const candidateMap = new Map(
      rows.map((row) => [`${row.document_id}\u0000${row.block_id}`, row.document_id]),
    );
    if (candidateMap.size === 0)
      return {
        answer: '知识库中未找到相关内容。',
        citations: [],
        candidateCount: 0,
        retrievalMode,
      };
    return {
      ...(await this.completeWithCitations(request.question, rows, candidateMap)),
      candidateCount: candidateMap.size,
      retrievalMode,
    };
  }

  /** 用于调用模型并过滤候选集之外的非法引用。 */
  private async completeWithCitations(
    question: string,
    rows: readonly HybridRecallRow[],
    candidateMap: ReadonlyMap<string, string>,
  ): Promise<{ answer: string; citations: { blockId: string; documentId: string }[] }> {
    const raw = await this.gateway
      .requireProvider()
      .complete(
        buildQaMessages(
          question,
          rows
            .map(
              (row, index) =>
                `[${index + 1}] 文档 ${row.document_title}(${row.document_id}) 块 ${row.block_id}：${row.text}`,
            )
            .join('\n'),
        ),
      );
    const parsed = extractJsonObject(raw) as { answer?: unknown; citations?: unknown } | null;
    if (parsed === null)
      throw new ApiDomainException({
        code: 'LLM_INVALID_OUTPUT',
        kind: 'domain',
        message: '模型输出无法解析，请重试。',
        status: HttpStatus.BAD_GATEWAY,
      });
    return sanitizeCitations(parsed, candidateMap);
  }
}
