/** @fileoverview 维护正文引用集与附件引用计数及生命周期的增量同步。 */

import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import type { Transaction } from 'kysely' with { 'resolution-mode': 'import' };

import type { DatabaseSchema, JsonValue } from '../database/database.types';

/** 用于按附件标识聚合引用计数增量。 */
type ReferenceDeltas = Map<string, number>;

/** 用于读取文档行内正文并比对新旧引用集后更新附件计数。 */
@Injectable()
export class AttachmentReferencesService {
  /** 用于在保存或恢复事务内按新旧正文全量重算该文档的引用集。 */
  async applyDocumentReferences(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    documentId: string,
    nextJson: JsonValue,
  ): Promise<void> {
    const row = await transaction
      .selectFrom('documents')
      .select(['content_json'])
      .where('id', '=', documentId)
      .where('owner_id', '=', ownerId)
      .executeTakeFirst();
    const current =
      row === undefined ? new Map<string, number>() : countReferences(row.content_json);
    const next = countReferences(nextJson);
    const deltas = computeDeltas(current, next);
    if (deltas.size === 0) return;
    await this.applyDeltas(transaction, ownerId, deltas);
    // ponytail: 引用计数增量式维护依赖保存/恢复/清理三个写入口全部接线，新增正文写入口时必须同步调用。
  }

  /** 用于在永久清理文档前按其正文递减全部附件引用。 */
  async decrementForDocuments(
    transaction: Transaction<DatabaseSchema>,
    documents: readonly { contentJson: JsonValue; ownerId: string }[],
  ): Promise<void> {
    const byOwner = new Map<string, ReferenceDeltas>();
    for (const document of documents) {
      const counts = countReferences(document.contentJson);
      if (counts.size === 0) continue;
      const deltas = byOwner.get(document.ownerId) ?? new Map<string, number>();
      for (const [id, count] of counts) deltas.set(id, (deltas.get(id) ?? 0) - count);
      byOwner.set(document.ownerId, deltas);
    }
    for (const [ownerId, deltas] of byOwner) {
      // 清理路径容忍已消失的附件行，避免悬空引用卡死整个清理批次。
      await this.applyDeltas(transaction, ownerId, deltas, true);
    }
  }

  /** 用于按增量更新计数并同步生命周期状态，未知或他人附件整体拒绝。 */
  private async applyDeltas(
    transaction: Transaction<DatabaseSchema>,
    ownerId: string,
    deltas: ReferenceDeltas,
    tolerateMissing = false,
  ): Promise<void> {
    const { sql } = await import('kysely');
    const values = sql.join([...deltas].map(([id, delta]) => sql`(${id}::uuid, ${delta}::int)`));
    const result = await sql<{ id: string }>`
      UPDATE attachments a
      SET reference_count = a.reference_count + d.delta,
        status = CASE WHEN a.reference_count + d.delta > 0 THEN 'active' ELSE 'pending' END,
        updated_at = transaction_timestamp()
      FROM (VALUES ${values}) AS d(id, delta)
      WHERE a.id = d.id AND a.owner_id = ${ownerId}::uuid
      RETURNING a.id
    `.execute(transaction);
    if (result.rows.length !== deltas.size && !tolerateMissing) {
      throw new UnprocessableEntityException();
    }
  }
}

/** 用于从已校验正文中提取附件节点引用计数。 */
function countReferences(contentJson: JsonValue | null): Map<string, number> {
  const counts = new Map<string, number>();
  collectNodeReferences(contentJson, counts);
  return counts;
}

/** 用于读取附件节点 attrs 中的合法 attachmentId 引用。 */
function attachmentIdOf(node: Record<string, unknown>): string | undefined {
  if (typeof node.attrs !== 'object' || node.attrs === null) return undefined;
  const attachmentId = (node.attrs as Record<string, unknown>).attachmentId;
  return typeof attachmentId === 'string' && attachmentId.length > 0 ? attachmentId : undefined;
}

/** 用于递归收集 image/attachment 节点的 attachmentId 引用。 */
function collectNodeReferences(node: unknown, counts: Map<string, number>): void {
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return;
  const record = node as Record<string, unknown>;
  const isAttachmentNode = record.type === 'image' || record.type === 'attachment';
  const attachmentId = isAttachmentNode ? attachmentIdOf(record) : undefined;
  if (attachmentId !== undefined) {
    counts.set(attachmentId, (counts.get(attachmentId) ?? 0) + 1);
  }
  const children = record.content;
  if (Array.isArray(children)) {
    for (const child of children) collectNodeReferences(child, counts);
  }
}

/** 用于计算新旧引用集之间的计数增量并丢弃零差值。 */
function computeDeltas(current: Map<string, number>, next: Map<string, number>): ReferenceDeltas {
  const deltas = new Map<string, number>();
  for (const [id, count] of next) {
    const delta = count - (current.get(id) ?? 0);
    if (delta !== 0) deltas.set(id, delta);
  }
  for (const [id, count] of current) {
    if (!next.has(id)) deltas.set(id, -count);
  }
  return deltas;
}
