/** @fileoverview 定义 Inbox 转换幂等键的锁定、请求指纹与首次响应存取。 */

import { createHash, randomUUID } from 'node:crypto';

import type { DocumentDetail } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import { ApiConflictException } from '../http-boundary/api-conflict.exception';
import type { DatabaseSchema, JsonValue } from '../database/database.types';
import type { Transaction } from 'kysely' with {
  'resolution-mode': 'import',
};
import type { ConvertInboxItemDto } from './convert-inbox-item.dto';

const CONVERT_OPERATION = 'inbox-item.convert';
const DETAIL_KEYS = 'childCount,id,knowledgeBaseId,parentId,title,updatedAt,version';

/** 用于承载单次转换请求的操作者、目标与幂等键范围。 */
export interface ConvertContext {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly input: ConvertInboxItemDto;
  readonly ownerId: string;
}

/** 用于只接受存储投影中的安全非负整数计数。 */
function isStoredCount(value: JsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** 用于只接受存储投影中的正整数版本。 */
function isStoredVersion(value: JsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

/** 用于只重建本服务首次写入的严格转换响应投影。 */
function readStoredDetail(value: JsonValue): DocumentDetail {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Stored idempotency response is invalid');
  }
  const candidate = value as Record<string, JsonValue>;
  const valuesValid = [
    isStoredCount(candidate.childCount),
    typeof candidate.id === 'string',
    typeof candidate.knowledgeBaseId === 'string',
    candidate.parentId === null || typeof candidate.parentId === 'string',
    typeof candidate.title === 'string',
    typeof candidate.updatedAt === 'string',
    isStoredVersion(candidate.version),
  ].every(Boolean);
  if (Object.keys(candidate).sort().join(',') !== DETAIL_KEYS || !valuesValid) {
    throw new TypeError('Stored idempotency response is invalid');
  }
  return {
    childCount: candidate.childCount as number,
    id: candidate.id as string,
    knowledgeBaseId: candidate.knowledgeBaseId as string,
    parentId: (candidate.parentId as string | null) ?? null,
    title: candidate.title as string,
    updatedAt: candidate.updatedAt as string,
    version: candidate.version as number,
  };
}

/** 用于创建稳定请求指纹且不持久化用户控制的 JSON。 */
export function createConvertHash(context: ConvertContext): string {
  const { id, input } = context;
  const fingerprint = JSON.stringify([
    id,
    input.knowledgeBaseId,
    input.parentId ?? null,
    input.title,
  ]);
  return createHash('sha256').update(`${CONVERT_OPERATION}\0${fingerprint}`).digest('hex');
}

/** 用于串行化并发调用使用的所有者范围幂等键。 */
export async function lockConvertIdempotencyKey(
  transaction: Transaction<DatabaseSchema>,
  context: ConvertContext,
): Promise<void> {
  const { sql } = await import('kysely');
  const lockKey = `${context.ownerId}:${CONVERT_OPERATION}:${context.idempotencyKey}`;
  await sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}::text, 0::bigint))
  `.execute(transaction);
}

/** 用于返回已存响应或拒绝其他请求复用该键。 */
export async function readConvertIdempotentResponse(
  transaction: Transaction<DatabaseSchema>,
  context: ConvertContext,
  requestHash: string,
): Promise<DocumentDetail | undefined> {
  const record = await transaction
    .selectFrom('idempotency_records')
    .select(['request_hash', 'response_json'])
    .where('owner_id', '=', context.ownerId)
    .where('operation', '=', CONVERT_OPERATION)
    .where('idempotency_key', '=', context.idempotencyKey)
    .executeTakeFirst();
  if (record === undefined) return;
  if (record.request_hash !== requestHash) {
    throw new ApiConflictException('IDEMPOTENCY_CONFLICT');
  }
  return readStoredDetail(record.response_json);
}

/** 用于在同一事务中保存首次成功公开响应。 */
export async function storeConvertIdempotentResponse(
  transaction: Transaction<DatabaseSchema>,
  context: ConvertContext,
  requestHash: string,
  detail: DocumentDetail,
): Promise<void> {
  await transaction
    .insertInto('idempotency_records')
    .values({
      id: randomUUID(),
      idempotency_key: context.idempotencyKey,
      operation: CONVERT_OPERATION,
      owner_id: context.ownerId,
      request_hash: requestHash,
      response_json: { ...detail },
    })
    .executeTakeFirstOrThrow();
}
