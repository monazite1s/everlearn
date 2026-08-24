/** @fileoverview 实现限定所有者的 Inbox 记录单事务幂等转换。 */

import { randomUUID } from 'node:crypto';

import type { DocumentDetail } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Transaction } from 'kysely' with {
  'resolution-mode': 'import',
};

import type { DatabaseSchema, JsonValue } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import { DocumentsService } from '../documents/documents.service';
import { LocalIdentityContext } from '../identity/local-identity.context';
import type { ConvertInboxItemDto } from './convert-inbox-item.dto';
import {
  createConvertHash,
  lockConvertIdempotencyKey,
  readConvertIdempotentResponse,
  storeConvertIdempotentResponse,
  type ConvertContext,
} from './inbox-item-conversion.idempotency';

interface LockedPendingItem {
  content: string;
  kind: 'text' | 'url';
}

/** 用于把记录内容映射为一段纯文本承载的最小合法初始正文。 */
function buildParagraphContent(content: string): { contentJson: JsonValue; plainText: string } {
  return {
    contentJson: {
      content: [
        {
          attrs: { blockId: randomUUID() },
          content: [{ text: content, type: 'text' }],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    },
    plainText: content,
  };
}

/** 用于在所有者边界内以幂等键原子执行一次 Inbox 转换。 */
@Injectable()
export class InboxItemConversionService {
  /** 用于接收共享数据库客户端、文档创建服务与可信本地身份。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly documentsService: DocumentsService,
    private readonly identityContext: LocalIdentityContext,
  ) {}

  /** 用于提交前解析操作者并让转换全部变更共享单一事务。 */
  async convert(
    id: string,
    input: ConvertInboxItemDto,
    idempotencyKey: string,
  ): Promise<DocumentDetail> {
    const { ownerId } = this.identityContext.getActor();
    return this.databaseService.client
      .transaction()
      .execute((transaction) =>
        this.convertInTransaction(transaction, { id, idempotencyKey, input, ownerId }),
      );
  }

  /** 用于在单事务内完成重放检查、记录锁定、文档创建与终态标记。 */
  private async convertInTransaction(
    transaction: Transaction<DatabaseSchema>,
    context: ConvertContext,
  ): Promise<DocumentDetail> {
    const requestHash = createConvertHash(context);
    await lockConvertIdempotencyKey(transaction, context);
    const replay = await readConvertIdempotentResponse(transaction, context, requestHash);
    if (replay !== undefined) return replay;
    const item = await this.lockPendingItem(transaction, context);
    const content = buildParagraphContent(item.content);
    const detail = await this.documentsService.createInTransaction(
      transaction,
      context.ownerId,
      context.input.knowledgeBaseId,
      {
        ...(context.input.parentId === undefined ? {} : { parentId: context.input.parentId }),
        plainText: content.plainText,
        revisionContent: content.contentJson,
        title: context.input.title,
      },
    );
    await this.markConverted(transaction, context.id, context.ownerId, detail.id);
    await storeConvertIdempotentResponse(transaction, context, requestHash, detail);
    return detail;
  }

  /** 用于锁定本人待处理记录并统一隐藏缺失、他人、已删与已转换记录。 */
  private async lockPendingItem(
    transaction: Transaction<DatabaseSchema>,
    context: ConvertContext,
  ): Promise<LockedPendingItem> {
    const item = await transaction
      .selectFrom('inbox_items')
      .select(['kind', 'content'])
      .where('id', '=', context.id)
      .where('owner_id', '=', context.ownerId)
      .where('status', '=', 'pending')
      .where('deleted_at', 'is', null)
      .forUpdate()
      .executeTakeFirst();
    if (item === undefined) throw new NotFoundException();
    return item;
  }

  /** 用于在持有行锁时写入转换终态与目标文档关联。 */
  private async markConverted(
    transaction: Transaction<DatabaseSchema>,
    id: string,
    ownerId: string,
    documentId: string,
  ): Promise<void> {
    const { sql } = await import('kysely');
    await transaction
      .updateTable('inbox_items')
      .set({
        converted_document_id: documentId,
        status: 'converted',
        updated_at: sql`transaction_timestamp()`,
      })
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .executeTakeFirstOrThrow();
  }
}
