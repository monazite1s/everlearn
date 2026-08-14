/** @fileoverview 实现知识库乐观更新和软删除生命周期变更。 */

import { createHash, randomUUID } from 'node:crypto';

import type { KnowledgeBaseSummary } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Transaction } from 'kysely' with { 'resolution-mode': 'import' };

import { ApiConflictException } from '../http-boundary/api-conflict.exception';
import type { DatabaseSchema, JsonValue } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import { LocalIdentityContext } from '../identity/local-identity.context';
import type { KnowledgeBaseVersionDto } from './knowledge-base-version.dto';
import { readActiveKnowledgeBaseSummary } from './knowledge-base-summary.query';
import type { UpdateKnowledgeBaseDto } from './update-knowledge-base.dto';

const RESTORE_OPERATION = 'knowledge-base.restore';
const SUMMARY_KEYS = 'description,documentCount,id,kind,name,updatedAt,version';

interface LockedKnowledgeBase {
  deleted_at: Date | null;
  id: string;
  version: number;
}

interface RestoreInput {
  id: string;
  idempotencyKey: string;
  ownerId: string;
  version: number;
}

/** 用于创建稳定请求指纹且不持久化用户控制的 JSON。 */
function createRestoreHash(id: string, version: number): string {
  return createHash('sha256').update(`${RESTORE_OPERATION}\0${id}\0${version}`).digest('hex');
}

/** 用于只接受存储投影中的安全非负整数计数。 */
function isDocumentCount(value: JsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** 用于只接受存储投影中的正整数版本。 */
function isVersion(value: JsonValue | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

/** 用于只重建本服务写入的严格公开投影。 */
function readStoredSummary(value: JsonValue): KnowledgeBaseSummary {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Stored idempotency response is invalid');
  }
  const candidate = value as Record<string, JsonValue>;
  const primitivesValid = [
    typeof candidate.description === 'string',
    isDocumentCount(candidate.documentCount),
    typeof candidate.id === 'string',
    typeof candidate.name === 'string',
    typeof candidate.updatedAt === 'string',
    isVersion(candidate.version),
  ].every(Boolean);
  const kindValid =
    candidate.kind === 'news' || candidate.kind === 'normal' || candidate.kind === 'tutorial';
  const keysValid = Object.keys(candidate).sort().join(',') === SUMMARY_KEYS;
  if (!primitivesValid || !kindValid || !keysValid) {
    throw new TypeError('Stored idempotency response is invalid');
  }
  return {
    description: candidate.description as string,
    documentCount: candidate.documentCount as number,
    id: candidate.id as string,
    kind: candidate.kind as 'news' | 'normal' | 'tutorial',
    name: candidate.name as string,
    updatedAt: candidate.updatedAt as string,
    version: candidate.version as number,
  };
}

/** 用于在可信所有者边界内串行执行生命周期变更。 */
@Injectable()
export class KnowledgeBaseLifecycleService {
  /** 用于接收数据库客户端和服务端操作者上下文。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identityContext: LocalIdentityContext,
  ) {}

  /** 用于在调用方仍持有当前版本时更新可编辑元数据。 */
  async update(id: string, input: UpdateKnowledgeBaseDto): Promise<KnowledgeBaseSummary> {
    const { ownerId } = this.identityContext.getActor();
    return this.databaseService.client.transaction().execute(async (transaction) => {
      const row = await this.lockKnowledgeBase(transaction, id, ownerId);
      if (row?.deleted_at !== null) throw new NotFoundException();
      this.requireVersion(row.version, input.version);
      const { sql } = await import('kysely');
      await transaction
        .updateTable('knowledge_bases')
        .set({
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.name === undefined ? {} : { name: input.name }),
          updated_at: sql`transaction_timestamp()`,
          version: sql`version + 1`,
        })
        .where('id', '=', id)
        .where('owner_id', '=', ownerId)
        .executeTakeFirstOrThrow();
      return readActiveKnowledgeBaseSummary(transaction, id, ownerId);
    });
  }

  /** 用于软删除知识库并保证精确重试无额外副作用。 */
  async remove(id: string, input: KnowledgeBaseVersionDto): Promise<void> {
    const { ownerId } = this.identityContext.getActor();
    await this.databaseService.client.transaction().execute(async (transaction) => {
      const row = await this.lockKnowledgeBase(transaction, id, ownerId);
      if (row === undefined) throw new NotFoundException();
      if (row.deleted_at !== null) return this.acceptDeleteReplay(row.version, input.version);
      this.requireVersion(row.version, input.version);
      const { sql } = await import('kysely');
      await transaction
        .updateTable('knowledge_bases')
        .set({
          deleted_at: sql`transaction_timestamp()`,
          updated_at: sql`transaction_timestamp()`,
          version: sql`version + 1`,
        })
        .where('id', '=', id)
        .where('owner_id', '=', ownerId)
        .executeTakeFirstOrThrow();
    });
  }

  /** 用于按所有者范围幂等键只恢复一次知识库。 */
  async restore(
    id: string,
    input: KnowledgeBaseVersionDto,
    idempotencyKey: string,
  ): Promise<KnowledgeBaseSummary> {
    const { ownerId } = this.identityContext.getActor();
    return this.databaseService.client.transaction().execute((transaction) =>
      this.restoreInTransaction(transaction, {
        id,
        idempotencyKey,
        ownerId,
        version: input.version,
      }),
    );
  }

  /** 用于解析恢复重放或原子提交状态变更和响应。 */
  private async restoreInTransaction(
    transaction: Transaction<DatabaseSchema>,
    input: RestoreInput,
  ): Promise<KnowledgeBaseSummary> {
    const requestHash = createRestoreHash(input.id, input.version);
    await this.lockIdempotencyKey(transaction, input);
    const replay = await this.readIdempotentResponse(transaction, input, requestHash);
    if (replay !== undefined) return replay;
    const row = await this.lockKnowledgeBase(transaction, input.id, input.ownerId);
    if (row === undefined) throw new NotFoundException();
    if (row.deleted_at === null) throw new ConflictException();
    this.requireVersion(row.version, input.version);
    const { sql } = await import('kysely');
    await transaction
      .updateTable('knowledge_bases')
      .set({
        deleted_at: null,
        updated_at: sql`transaction_timestamp()`,
        version: sql`version + 1`,
      })
      .where('id', '=', input.id)
      .where('owner_id', '=', input.ownerId)
      .executeTakeFirstOrThrow();
    const summary = await readActiveKnowledgeBaseSummary(transaction, input.id, input.ownerId);
    await this.storeIdempotentResponse(transaction, input, requestHash, summary);
    return summary;
  }

  /** 用于在同一事务中保存首次成功公开响应。 */
  private async storeIdempotentResponse(
    transaction: Transaction<DatabaseSchema>,
    input: RestoreInput,
    requestHash: string,
    summary: KnowledgeBaseSummary,
  ): Promise<void> {
    await transaction
      .insertInto('idempotency_records')
      .values({
        id: randomUUID(),
        idempotency_key: input.idempotencyKey,
        operation: RESTORE_OPERATION,
        owner_id: input.ownerId,
        request_hash: requestHash,
        response_json: { ...summary },
      })
      .executeTakeFirstOrThrow();
  }

  /** 用于串行化并发调用使用的所有者范围幂等键。 */
  private async lockIdempotencyKey(
    transaction: Transaction<DatabaseSchema>,
    input: RestoreInput,
  ): Promise<void> {
    const { sql } = await import('kysely');
    const lockKey = `${input.ownerId}:${RESTORE_OPERATION}:${input.idempotencyKey}`;
    await sql`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}::text, 0::bigint))
    `.execute(transaction);
  }

  /** 用于返回已存响应或拒绝其他请求复用该键。 */
  private async readIdempotentResponse(
    transaction: Transaction<DatabaseSchema>,
    input: RestoreInput,
    requestHash: string,
  ): Promise<KnowledgeBaseSummary | undefined> {
    const record = await transaction
      .selectFrom('idempotency_records')
      .select(['request_hash', 'response_json'])
      .where('owner_id', '=', input.ownerId)
      .where('operation', '=', RESTORE_OPERATION)
      .where('idempotency_key', '=', input.idempotencyKey)
      .executeTakeFirst();
    if (record === undefined) return;
    if (record.request_hash !== requestHash) {
      throw new ApiConflictException('IDEMPOTENCY_CONFLICT');
    }
    return readStoredSummary(record.response_json);
  }

  /** 用于锁定所有者范围记录以串行处理并发生命周期变更。 */
  private lockKnowledgeBase(
    transaction: Transaction<DatabaseSchema>,
    id: string,
    ownerId: string,
  ): Promise<LockedKnowledgeBase | undefined> {
    return transaction
      .selectFrom('knowledge_bases')
      .select(['id', 'version', 'deleted_at'])
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .forUpdate()
      .executeTakeFirst();
  }

  /** 用于只接受成功删除产生的精确重放关系。 */
  private acceptDeleteReplay(currentVersion: number, requestedVersion: number): void {
    if (currentVersion !== requestedVersion + 1) {
      throw new ApiConflictException('VERSION_CONFLICT');
    }
  }

  /** 用于以稳定公开冲突类型拒绝过期写入。 */
  private requireVersion(currentVersion: number, requestedVersion: number): void {
    if (currentVersion !== requestedVersion) {
      throw new ApiConflictException('VERSION_CONFLICT');
    }
  }
}
