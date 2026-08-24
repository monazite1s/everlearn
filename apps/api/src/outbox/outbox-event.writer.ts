/** @fileoverview 在业务事务内原子追加 Search 可重放的文档领域事件。 */

import { randomUUID } from 'node:crypto';

import type {
  DocumentLifecycleEventPayload,
  DocumentSavedEventPayload,
  DocumentSearchEventType,
} from '@everlearn/contracts' with { 'resolution-mode': 'import' };
import type { Transaction } from 'kysely' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database/database.types';

export type DocumentSearchEventPayload = DocumentLifecycleEventPayload | DocumentSavedEventPayload;

/**
 * 用于让文档事实与待投递事件共享同一提交边界并以业务版本幂等收敛。
 * @designPattern Transactional Outbox — 原子提交领域写入与待投递事件，避免提交后崩溃造成永久丢失。
 */
export async function appendDocumentSearchEvent(
  transaction: Transaction<DatabaseSchema>,
  ownerId: string,
  eventType: DocumentSearchEventType,
  payload: DocumentSearchEventPayload,
): Promise<void> {
  const { sql } = await import('kysely');
  await sql`
    INSERT INTO outbox_events (
      id, owner_id, event_type, aggregate_id, aggregate_version, schema_version, payload
    ) VALUES (
      ${randomUUID()}::uuid,
      ${ownerId}::uuid,
      ${eventType},
      ${payload.documentId}::uuid,
      ${payload.documentVersion},
      ${payload.eventSchemaVersion},
      ${JSON.stringify(payload)}::jsonb
    )
    ON CONFLICT (owner_id, event_type, aggregate_id, aggregate_version) DO NOTHING
  `.execute(transaction);
}
