/** @fileoverview 提供保存正文时同事务重建文档内部链接的写侧服务。 */

import { Injectable } from '@nestjs/common';
import type { Transaction } from 'kysely' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database/database.types';
import { DatabaseService } from '../database/database.service';

import { collectDocumentLinks } from './document-links.parser';

/** 用于持有内部链接写侧所需的最小数据库依赖。 */
@Injectable()
export class DocumentLinksService {
  /** 用于接收共享数据库客户端。 */
  constructor(private readonly databaseService: DatabaseService) {}

  /** 用于在保存正文的同一事务内删除旧链接并按去重集合重建。 */
  async replaceLinks(
    transaction: Transaction<DatabaseSchema>,
    documentId: string,
    contentJson: unknown,
  ): Promise<void> {
    await transaction
      .deleteFrom('document_links')
      .where('source_document_id', '=', documentId)
      .execute();
    const links = collectDocumentLinks(contentJson);
    if (links.length === 0) return;
    await transaction
      .insertInto('document_links')
      .values(
        links.map((link) => ({
          source_document_id: documentId,
          source_block_id: link.blockId,
          target_document_id: link.targetDocumentId,
        })),
      )
      .onConflict((conflict) => conflict.doNothing())
      .execute();
  }
}
