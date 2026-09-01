/**
 * @fileoverview 提供基于文档正文与用户指令的建议草稿流式生成。
 */

import { HttpStatus, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { ApiDomainException } from '../http-boundary/api-domain.exception';
import { LocalIdentityContext } from '../identity/local-identity.context';
import type { LlmMessage } from './llm-provider';
import { LlmGateway } from './llm-gateway';

/** 草稿生成请求。 */
export interface AiDraftRequest {
  readonly documentId: string;
  readonly instruction: string;
}

/** 用于返回不泄露文档存在性的统一拒绝。 */
function notFound(): ApiDomainException {
  return new ApiDomainException({
    code: 'NOT_FOUND',
    kind: 'domain',
    message: '请求的文档不存在或不可访问。',
    status: HttpStatus.NOT_FOUND,
  });
}

/** 用于生成要求依据正文与指令改写的消息序列。 */
function buildDraftMessages(plainText: string, instruction: string): readonly LlmMessage[] {
  return [
    {
      content:
        '你是文档写作助手。仅依据给定正文与用户指令输出建议草稿，' +
        '使用 Markdown 纯文本，不要输出解释或代码围栏。',
      role: 'system',
    },
    { content: `正文：\n${plainText}\n\n指令：${instruction}`, role: 'user' },
  ];
}

/** 用于读取当前所有者下指定文档的正文纯文本。 */
async function readDocumentPlainText(
  database: DatabaseService,
  ownerId: string,
  documentId: string,
): Promise<string> {
  const row = await database.client
    .selectFrom('documents')
    .select(['id', 'plain_text'])
    .where('id', '=', documentId)
    .where('owner_id', '=', ownerId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  if (row === undefined) throw notFound();
  return row.plain_text;
}

/** 用于流式产出建议草稿的应用服务。 */
@Injectable()
export class AiDraftService {
  /** 用于注入数据库、身份边界与 LLM 网关。 */
  constructor(
    private readonly database: DatabaseService,
    private readonly identity: LocalIdentityContext,
    private readonly gateway: LlmGateway,
  ) {}

  /** 用于校验文档归属后流式产出建议草稿增量。 */
  async *streamDraft(request: AiDraftRequest): AsyncGenerator<string> {
    const ownerId = this.identity.getActor().ownerId;
    const plainText = await readDocumentPlainText(this.database, ownerId, request.documentId);
    yield* this.gateway
      .requireProvider()
      .stream(buildDraftMessages(plainText, request.instruction));
  }
}
