/**
 * @fileoverview 实现 Workflow 节点的知识库读取、文档创建与 LLM 副作用。
 */

import { createHash, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import { LlmGateway } from '../ai/llm-gateway';
import type { JsonValue } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import { workflowError } from './workflows.service';
import { withWorkflowTables, type WorkflowDatabaseSchema } from './workflow-db.types';

export interface KbReadResult {
  readonly plainText: string;
  readonly title: string;
}

export interface DocCreateResult {
  readonly documentId: string;
}

/** 文档创建节点的服务端输入。 */
export interface CreateDocumentInput {
  readonly knowledgeBaseId: string;
  readonly nodeId: string;
  readonly ownerId: string;
  readonly plainText: string;
  readonly title: string;
  readonly workflowRunId: string;
}

/** 文档创建副作用的幂等操作名。 */
const DOC_CREATE_OPERATION = 'workflow.doc-create';

/** ponytail: 跨模块直写 documents/document_revisions 最小不变量；天花板为内部 API，升级条件是文档创建不变量出现第二处分叉。 */
@Injectable()
export class WorkflowEffectsService {
  /** 用于注入数据库与 LLM 网关。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly llmGateway: LlmGateway,
  ) {}

  /** 用于读取知识库文档纯文本并按所有者隔离。 */
  async readKbDocument(ownerId: string, documentId: string): Promise<KbReadResult> {
    const row = await withWorkflowTables(this.databaseService.client)
      .selectFrom('documents')
      .select(['title', 'plain_text'])
      .where('id', '=', documentId)
      .where('owner_id', '=', ownerId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (row === undefined) {
      throw workflowError('WORKFLOW_DOCUMENT_NOT_FOUND', '目标文档不存在或已删除。', 404);
    }
    return { plainText: row.plain_text, title: row.title };
  }

  /** 用于校验知识库归属，目标缺失或已删除时抛稳定错误码。 */
  private async requireKnowledgeBase(ownerId: string, knowledgeBaseId: string): Promise<void> {
    const knowledgeBase = await withWorkflowTables(this.databaseService.client)
      .selectFrom('knowledge_bases')
      .select('id')
      .where('id', '=', knowledgeBaseId)
      .where('owner_id', '=', ownerId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (knowledgeBase === undefined) {
      throw workflowError('WORKFLOW_KB_NOT_FOUND', '目标知识库不存在或已删除。', 404);
    }
  }

  /** 用于在事务内写入文档与初始修订并返回文档标识。 */
  private async insertDocumentWithRevision(
    input: CreateDocumentInput,
    documentId: string,
    contentJson: JsonValue,
  ): Promise<DocCreateResult> {
    return this.databaseService.client.transaction().execute(async (transaction) => {
      const tx = withWorkflowTables(transaction);
      const position = await tx
        .selectFrom('documents')
        .select(({ fn }) => fn.max('position').as('max_position'))
        .where('knowledge_base_id', '=', input.knowledgeBaseId)
        .where('owner_id', '=', input.ownerId)
        .executeTakeFirstOrThrow();
      await tx
        .insertInto('documents')
        .values({
          id: documentId,
          owner_id: input.ownerId,
          knowledge_base_id: input.knowledgeBaseId,
          parent_id: null,
          path: `/${documentId}`,
          position: Number(position.max_position ?? -1) + 1,
          title: input.title,
          content_json: contentJson,
          plain_text: input.plainText,
        })
        .executeTakeFirstOrThrow();
      await tx
        .insertInto('document_revisions')
        .values({
          id: randomUUID(),
          owner_id: input.ownerId,
          document_id: documentId,
          revision_number: 1,
          source: 'automation',
          title: input.title,
          content_json: contentJson,
          schema_version: 1,
          plain_text: input.plainText,
          created_by: input.ownerId,
          workflow_run_id: input.workflowRunId,
        })
        .executeTakeFirstOrThrow();
      return { documentId };
    });
  }

  /** 用于构造文档创建请求的内容指纹。 */
  private createDocCreateHash(input: CreateDocumentInput): string {
    return createHash('sha256')
      .update(
        `${DOC_CREATE_OPERATION}\0${input.knowledgeBaseId}\0${input.title}\0${input.plainText}`,
      )
      .digest('hex');
  }

  /** 用于在幂等记录命中时复用首次创建的文档标识。 */
  private async readExistingDocumentId(
    transaction: Kysely<WorkflowDatabaseSchema>,
    ownerId: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<string | undefined> {
    const record = await transaction
      .selectFrom('idempotency_records')
      .select(['request_hash', 'response_json'])
      .where('owner_id', '=', ownerId)
      .where('operation', '=', DOC_CREATE_OPERATION)
      .where('idempotency_key', '=', idempotencyKey)
      .executeTakeFirst();
    if (record === undefined) return undefined;
    if (record.request_hash !== requestHash) {
      throw workflowError('WORKFLOW_DOC_CREATE_CONFLICT', '幂等键已绑定不同内容。', 409);
    }
    const documentId = (record.response_json as { documentId?: unknown }).documentId;
    return typeof documentId === 'string' ? documentId : undefined;
  }

  /** 用于在目标知识库创建单段落文档并写入初始修订，重复运行按幂等键去重。 */
  async createDocument(input: CreateDocumentInput): Promise<DocCreateResult> {
    await this.requireKnowledgeBase(input.ownerId, input.knowledgeBaseId);
    const idempotencyKey = `${input.workflowRunId}:${input.nodeId}`;
    const requestHash = this.createDocCreateHash(input);
    return this.databaseService.client.transaction().execute(async (transaction) => {
      const tx = transaction as unknown as Kysely<WorkflowDatabaseSchema>;
      const { sql } = await import('kysely');
      const lockKey = `${input.ownerId}:${DOC_CREATE_OPERATION}:${idempotencyKey}`;
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}::text, 0::bigint))`.execute(
        tx,
      );
      const existing = await this.readExistingDocumentId(
        tx,
        input.ownerId,
        idempotencyKey,
        requestHash,
      );
      if (existing !== undefined) return { documentId: existing };
      const documentId = randomUUID();
      const contentJson = buildParagraphContent(input.plainText);
      await tx
        .insertInto('idempotency_records')
        .values({
          id: randomUUID(),
          idempotency_key: idempotencyKey,
          operation: DOC_CREATE_OPERATION,
          owner_id: input.ownerId,
          request_hash: requestHash,
          response_json: { documentId },
        })
        .executeTakeFirstOrThrow();
      return this.insertDocumentWithRevision(input, documentId, contentJson);
    });
  }

  /** 用于经 LLM 网关执行补全，未配置或上游失败时抛稳定错误码。 */
  async completeLlm(ownerId: string, prompt: string): Promise<{ content: string }> {
    void ownerId;
    const provider = this.llmGateway.requireProvider();
    return { content: await provider.complete([{ content: prompt, role: 'user' }]) };
  }
}

/** 用于构造带随机块标识的单段落文档内容。 */
function buildParagraphContent(text: string): JsonValue {
  return {
    content: [
      {
        attrs: { blockId: randomUUID() },
        content: text.length === 0 ? [] : [{ text, type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  } satisfies JsonValue;
}
