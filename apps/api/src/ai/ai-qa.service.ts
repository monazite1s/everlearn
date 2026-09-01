/**
 * @fileoverview 组合搜索召回、引用问答与非法引用过滤。
 */

import { HttpStatus, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { ApiDomainException } from '../http-boundary/api-domain.exception';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { normalizeSearchQuery } from '../search/search-query.dto';
import { activeKnowledgeBaseExists, readRankedSearchRows } from '../search/search-query.store';
import type { LlmMessage } from './llm-provider';
import { LlmGateway } from './llm-gateway';

/** 单次问答召回的候选块上限。 */
const QA_CANDIDATE_LIMIT = 8;

/** 带引用问答的公开响应形态。 */
export interface AiQaAnswer {
  readonly answer: string;
  readonly citations: readonly { readonly blockId: string; readonly documentId: string }[];
  readonly candidateCount: number;
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

/** 用于生成要求仅依据候选回答并输出 JSON 的消息序列。 */
function buildQaMessages(question: string, candidates: string): readonly LlmMessage[] {
  return [
    {
      content:
        '你是知识库问答助手。仅依据给定候选片段回答；输出严格 JSON：' +
        '{"answer":"string","citations":[{"documentId":"string","blockId":"string"}]}；' +
        '证据不足时 answer 明确说明未找到且 citations 为空数组，禁止编造引用。',
      role: 'system',
    },
    { content: `候选片段：\n${candidates}\n\n问题：${question}`, role: 'user' },
  ];
}

/** 用于从模型输出中解析 JSON 对象，失败时返回 undefined。 */
function parseModelJson(raw: string): { answer?: unknown; citations?: unknown } | undefined {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as { answer?: unknown; citations?: unknown };
  } catch {
    return undefined;
  }
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
  /** 用于注入数据库、身份边界与 LLM 网关。 */
  constructor(
    private readonly database: DatabaseService,
    private readonly identity: LocalIdentityContext,
    private readonly gateway: LlmGateway,
  ) {}

  /** 用于召回候选块并返回经过引用校验的答案。 */
  async answer(request: AiQaRequest): Promise<AiQaAnswer> {
    const ownerId = this.identity.getActor().ownerId;
    const exists = await activeKnowledgeBaseExists(
      this.database.client,
      ownerId,
      request.knowledgeBaseId,
    );
    if (!exists) throw notFound();
    const rows = await readRankedSearchRows(this.database.client, {
      cursor: undefined,
      limit: QA_CANDIDATE_LIMIT,
      ownerId,
      query: normalizeSearchQuery({
        knowledgeBaseId: request.knowledgeBaseId,
        query: request.question,
        scope: 'knowledgeBase',
      }),
    });
    const candidateMap = new Map(
      rows
        .filter((row) => row.block_id !== null && row.text !== null)
        .map((row) => [`${row.document_id}\u0000${row.block_id}`, row.document_id]),
    );
    if (candidateMap.size === 0)
      return { answer: '知识库中未找到相关内容。', citations: [], candidateCount: 0 };
    const raw = await this.gateway
      .requireProvider()
      .complete(
        buildQaMessages(
          request.question,
          rows
            .map(
              (row, index) =>
                `[${index + 1}] 文档 ${row.document_title}(${row.document_id}) 块 ${row.block_id}：${row.text ?? ''}`,
            )
            .join('\n'),
        ),
      );
    const parsed = parseModelJson(raw);
    if (parsed === undefined)
      throw new ApiDomainException({
        code: 'LLM_INVALID_OUTPUT',
        kind: 'domain',
        message: '模型输出无法解析，请重试。',
        status: HttpStatus.BAD_GATEWAY,
      });
    const sanitized = sanitizeCitations(parsed, candidateMap);
    return { ...sanitized, candidateCount: candidateMap.size };
  }
}
