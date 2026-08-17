/** @fileoverview 实现回收站 30 天到期对象的全局批量永久清理并返回统计。 */

import { Injectable } from '@nestjs/common';
import type { RawBuilder, Sql, Transaction } from 'kysely' with {
  'resolution-mode': 'import',
};

import type { DatabaseSchema, JsonValue } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import { AttachmentReferencesService } from '../attachments/attachment-references.service';

/** 用于限制单批独立事务清理的回收站子树或知识库数量。 */
export const PURGE_BATCH_SIZE = 100;

/** 用于承载一批到期文档子树的根主键与物化路径。 */
interface PurgeRoot {
  id: string;
  path: string;
}

/** 用于报告单批文档清理的实际删除计数与命中的回收站根数。 */
interface DocumentBatchResult {
  purgedDocuments: number;
  purgedInboxItems: number;
  purgeRoots: number;
}

/** 用于向 Worker 报告一次清理运行删除的对象计数。 */
export interface TrashPurgeStats {
  readonly purgedDocuments: number;
  readonly purgedInboxItems: number;
  readonly purgedKnowledgeBases: number;
}

/** 用于按全局保留期永久清理到期文档子树与无剩余文档的知识库。 */
@Injectable()
export class TrashPurgeService {
  /** 用于接收共享数据库客户端与附件引用递减服务。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly attachmentReferences: AttachmentReferencesService,
  ) {}

  /** 用于以调用方注入的时间循环独立事务批次清理全部到期对象。 */
  async purgeExpired(now: Date): Promise<TrashPurgeStats> {
    const stats = { purgedDocuments: 0, purgedInboxItems: 0, purgedKnowledgeBases: 0 };
    for (;;) {
      const batch = await this.databaseService.client
        .transaction()
        .execute((transaction) => this.purgeDocumentBatch(transaction, now));
      stats.purgedDocuments += batch.purgedDocuments;
      stats.purgedInboxItems += batch.purgedInboxItems;
      if (batch.purgeRoots === 0) break;
    }
    for (;;) {
      const purgedBases = await this.databaseService.client
        .transaction()
        .execute((transaction) => this.purgeKnowledgeBaseBatch(transaction, now));
      stats.purgedKnowledgeBases += purgedBases;
      if (purgedBases === 0) break;
    }
    return stats;
  }

  /** 用于在单事务内锁定并删除一批到期回收站子树及其 Inbox 转换引用。 */
  private async purgeDocumentBatch(
    transaction: Transaction<DatabaseSchema>,
    now: Date,
  ): Promise<DocumentBatchResult> {
    const roots = await this.selectExpiredRoots(transaction, now);
    if (roots.length === 0) {
      return { purgedDocuments: 0, purgedInboxItems: 0, purgeRoots: 0 };
    }
    await this.decrementAttachmentReferences(transaction, roots);
    const purgedInboxItems = await this.deleteInboxReferences(transaction, roots);
    const { sql } = await import('kysely');
    const documents = await sql<{ id: string }>`
      DELETE FROM documents d WHERE ${this.buildSubtreePredicate(sql, roots)} RETURNING d.id
    `.execute(transaction);
    return {
      purgedDocuments: documents.rows.length,
      purgedInboxItems,
      purgeRoots: roots.length,
    };
  }

  /** 用于在删除子树前按其正文快照递减附件引用计数。 */
  private async decrementAttachmentReferences(
    transaction: Transaction<DatabaseSchema>,
    roots: readonly PurgeRoot[],
  ): Promise<void> {
    const { sql } = await import('kysely');
    const rows = await sql<{ contentJson: unknown; ownerId: string }>`
      SELECT d.content_json AS "contentJson", d.owner_id AS "ownerId"
      FROM documents d WHERE ${this.buildSubtreePredicate(sql, roots)}
    `.execute(transaction);
    await this.attachmentReferences.decrementForDocuments(
      transaction,
      rows.rows.map((row) => ({
        contentJson: row.contentJson as JsonValue,
        ownerId: row.ownerId,
      })),
    );
  }

  /** 用于在单事务内锁定并删除一批到期且已无任何文档行的知识库。 */
  private async purgeKnowledgeBaseBatch(
    transaction: Transaction<DatabaseSchema>,
    now: Date,
  ): Promise<number> {
    const { sql } = await import('kysely');
    const { TRASH_RETENTION_DAYS } = await import('@everlearn/contracts');
    const bases = await sql<{ id: string }>`
      SELECT kb.id FROM knowledge_bases kb
      WHERE kb.deleted_at IS NOT NULL
        AND kb.deleted_at + (${TRASH_RETENTION_DAYS}::int * interval '1 day') <= ${now}
        AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.knowledge_base_id = kb.id)
      ORDER BY kb.deleted_at, kb.id
      LIMIT ${PURGE_BATCH_SIZE}
      FOR UPDATE
    `.execute(transaction);
    if (bases.rows.length === 0) return 0;
    const result = await transaction
      .deleteFrom('knowledge_bases')
      .where(
        'id',
        'in',
        bases.rows.map((row) => row.id),
      )
      .executeTakeFirst();
    return Number(result.numDeletedRows);
  }

  /** 用于选取到期回收站条目根并锁定行以串行化并发恢复。 */
  private async selectExpiredRoots(
    transaction: Transaction<DatabaseSchema>,
    now: Date,
  ): Promise<readonly PurgeRoot[]> {
    const { sql } = await import('kysely');
    const { TRASH_RETENTION_DAYS } = await import('@everlearn/contracts');
    const roots = await sql<PurgeRoot>`
      SELECT d.id, d.path FROM documents d
      WHERE d.deleted_at IS NOT NULL
        AND d.deleted_at + (${TRASH_RETENTION_DAYS}::int * interval '1 day') <= ${now}
        AND (
          d.parent_id IS NULL
          OR NOT EXISTS (SELECT 1 FROM documents p
            WHERE p.id = d.parent_id AND p.deleted_at IS NOT NULL)
        )
      ORDER BY d.deleted_at, d.id
      LIMIT ${PURGE_BATCH_SIZE}
      FOR UPDATE
    `.execute(transaction);
    return roots.rows;
  }

  /** 用于先解除 Inbox 转换外键引用再删除子树文档行。 */
  private async deleteInboxReferences(
    transaction: Transaction<DatabaseSchema>,
    roots: readonly PurgeRoot[],
  ): Promise<number> {
    const { sql } = await import('kysely');
    const result = await sql<{ id: string }>`
      DELETE FROM inbox_items i
      WHERE i.converted_document_id IN (
        SELECT d.id FROM documents d WHERE ${this.buildSubtreePredicate(sql, roots)}
      )
      RETURNING i.id
    `.execute(transaction);
    return result.rows.length;
  }

  /** 用于把一批回收站根展开为主键与路径前缀参数化的完整子树谓词。 */
  private buildSubtreePredicate(sql: Sql, roots: readonly PurgeRoot[]): RawBuilder<unknown> {
    return sql.join(
      roots.map((root) => sql`(d.id = ${root.id}::uuid OR d.path LIKE ${`${root.path}/%`})`),
      sql` OR `,
    );
  }
}
