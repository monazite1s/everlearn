/** @fileoverview 实现按统一乐观版本保存与读取文档正文的服务端切片。 */

import type { DocumentContentDetail } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Transaction } from 'kysely' with {
  'resolution-mode': 'import',
};

import type { DatabaseSchema } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import { ApiConflictException } from '../http-boundary/api-conflict.exception';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { loadDocumentContentRules, validateDocumentContent } from './document-content.validator';
import { readActiveDocumentContent } from './document-projection.query';
import type { SaveDocumentContentDto } from './save-document-content.dto';

interface LockedDocument {
  id: string;
  knowledgeBaseId: string;
  version: number;
}

/** 用于持有正文读取与保存所需的最小身份和数据库依赖。 */
@Injectable()
export class DocumentContentService {
  /** 用于接收共享数据库客户端和可信本地身份上下文。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identityContext: LocalIdentityContext,
  ) {}

  /** 用于读取有效文档的详情与正文投影。 */
  async read(id: string): Promise<DocumentContentDetail> {
    const { ownerId } = this.identityContext.getActor();
    return readActiveDocumentContent(this.databaseService.client, id, ownerId);
  }

  /** 用于在提交版本有效时保存标题与正文并返回更新后的内容投影。 */
  async save(id: string, input: SaveDocumentContentDto): Promise<DocumentContentDetail> {
    const { ownerId } = this.identityContext.getActor();
    return this.databaseService.client
      .transaction()
      .execute((transaction) => this.saveInTransaction(transaction, ownerId, id, input));
  }

  /** 用于先锁知识库行再锁文档行并拒绝不可探测目标。 */
  private async lockScope(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    id: string,
  ): Promise<LockedDocument> {
    const { sql } = await import('kysely');
    const scope = await sql<{ knowledgeBaseId: string }>`
      SELECT d.knowledge_base_id AS "knowledgeBaseId"
      FROM documents d
      JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id AND kb.owner_id = d.owner_id
      WHERE d.id = ${id}::uuid AND d.owner_id = ${ownerId}::uuid
        AND d.deleted_at IS NULL AND kb.deleted_at IS NULL
      FOR UPDATE OF kb
    `.execute(transaction);
    if (scope.rows[0] === undefined) throw new NotFoundException();
    const document = await transaction
      .selectFrom('documents')
      .select(['id', 'knowledge_base_id', 'version'])
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .where('deleted_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    if (document === undefined) throw new NotFoundException();
    return {
      id: document.id,
      knowledgeBaseId: document.knowledge_base_id,
      version: document.version,
    };
  }

  /** 用于在锁内完成版本比对、正文校验、落库与内容投影读取。 */
  private async saveInTransaction(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    id: string,
    input: SaveDocumentContentDto,
  ): Promise<DocumentContentDetail> {
    const document = await this.lockScope(transaction, ownerId, id);
    if (document.version !== input.version) {
      throw new ApiConflictException('VERSION_CONFLICT');
    }
    const rules = await loadDocumentContentRules();
    if (input.schemaVersion !== rules.schemaVersion) {
      throw new UnprocessableEntityException();
    }
    const content = validateDocumentContent(input.contentJson, rules);
    if (content === undefined) {
      throw new UnprocessableEntityException();
    }
    const { sql } = await import('kysely');
    await transaction
      .updateTable('documents')
      .set({
        content_json: content.contentJson,
        plain_text: content.plainText,
        schema_version: input.schemaVersion,
        ...(input.title === undefined ? {} : { title: input.title }),
        updated_at: sql`transaction_timestamp()`,
        version: sql`version + 1`,
      })
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .executeTakeFirstOrThrow();
    // ponytail: outbox 表落地后在此事务内写 document.saved 事件（载荷 DocumentSavedEventPayload），供 Worker 投影纯文本与检索块。
    return readActiveDocumentContent(transaction, id, ownerId);
  }
}
