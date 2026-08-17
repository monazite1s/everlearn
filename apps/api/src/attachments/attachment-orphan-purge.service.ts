/** @fileoverview 实现超时 pending 附件的逐行对象删除与行清理。 */

import { Injectable } from '@nestjs/common';
import type { Transaction } from 'kysely' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import { AttachmentStorageProvider } from './attachment-storage.provider';

/** 用于向 Worker 报告一次孤儿清理删除的附件计数。 */
export interface AttachmentOrphanPurgeStats {
  readonly purgedAttachments: number;
}

/** 用于按全局 pending 存留上限删除零引用对象及数据库行。 */
@Injectable()
export class AttachmentOrphanPurgeService {
  /** 用于接收共享数据库客户端与存储适配器。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly storage: AttachmentStorageProvider,
  ) {}

  /** 用于循环单行事务清理全部到期孤儿，行级隔离防单点毒对象阻塞。 */
  async purgeExpired(now: Date): Promise<AttachmentOrphanPurgeStats> {
    let purgedAttachments = 0;
    for (;;) {
      const count = await this.databaseService.client
        .transaction()
        .execute((transaction) => this.purgeOne(transaction, now));
      if (count === 0) break;
      purgedAttachments += count;
    }
    return { purgedAttachments };
  }

  /** 用于在单事务内先删对象再删行，失败整体回滚供重试。 */
  private async purgeOne(transaction: Transaction<DatabaseSchema>, now: Date): Promise<number> {
    const { sql } = await import('kysely');
    const { ATTACHMENT_PENDING_TTL_HOURS } = await import('@everlearn/contracts');
    const rows = await sql<{ id: string; object_key: string }>`
      SELECT id, object_key FROM attachments
      WHERE status = 'pending'
        AND updated_at + make_interval(hours => ${ATTACHMENT_PENDING_TTL_HOURS}::int) <= ${now}
      ORDER BY updated_at, id
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `.execute(transaction);
    const row = rows.rows[0];
    if (row === undefined) return 0;
    await this.storage.deleteObject(row.object_key);
    await transaction.deleteFrom('attachments').where('id', '=', row.id).execute();
    return 1;
  }
}
