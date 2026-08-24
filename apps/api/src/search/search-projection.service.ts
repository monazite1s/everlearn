/** @fileoverview 编排可靠 Outbox 消费、有限退避与搜索投影补偿扫描。 */

import { Injectable, Logger } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import { SearchProjectionPermanentError, type ClaimedSearchEvent } from './search-projection.model';
import {
  applyClaimedEvent,
  claimPendingEvent,
  findScanCandidates,
  markEventProcessed,
  projectScanCandidate,
  quarantineEvent,
  removeExtraProjections,
  SEARCH_EVENT_BATCH_SIZE,
} from './search-projection.store';

/** 单次 Outbox 排空操作的闭合统计。 */
export interface SearchEventProcessingStats {
  readonly processedEvents: number;
  readonly quarantinedEvents: number;
}

/** 单次补偿扫描实际修复的投影统计。 */
export interface SearchProjectionScanStats {
  readonly projectedDocuments: number;
  readonly removedProjections: number;
}

type ProcessOneResult = 'none' | 'processed' | 'quarantined' | 'retry_scheduled';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 用于校验所有事件共享的标识、版本和知识库定位字段。 */
function hasValidCommonPayload(
  event: ClaimedSearchEvent,
  payload: Record<string, unknown>,
): boolean {
  if (payload.eventSchemaVersion !== 1) return false;
  if (payload.documentId !== event.aggregateId) return false;
  if (typeof payload.documentId !== 'string' || !UUID_PATTERN.test(payload.documentId))
    return false;
  if (payload.documentVersion !== event.aggregateVersion) return false;
  return typeof payload.knowledgeBaseId === 'string' && UUID_PATTERN.test(payload.knowledgeBaseId);
}

/** 用于把 JSON 载荷收窄为可检查的普通对象。 */
function readPayload(event: ClaimedSearchEvent): Record<string, unknown> | undefined {
  if (typeof event.payload !== 'object' || event.payload === null || Array.isArray(event.payload)) {
    return undefined;
  }
  return event.payload;
}

/** 用于限制保存事件正文 Schema 为当前消费者支持的版本。 */
function hasSupportedContentSchema(
  event: ClaimedSearchEvent,
  payload: Record<string, unknown>,
): boolean {
  return event.eventType !== 'document.saved' || payload.contentSchemaVersion === 1;
}
const SEARCH_RETRY_LIMIT = 5;

/** 用于校验当前消费者可安全解释的事件版本与最小载荷。 */
function validateEvent(event: ClaimedSearchEvent): string | undefined {
  if (event.schemaVersion !== 1) return 'OUTBOX_SCHEMA_UNSUPPORTED';
  if (!['document.deleted', 'document.restored', 'document.saved'].includes(event.eventType)) {
    return 'OUTBOX_EVENT_UNSUPPORTED';
  }
  const payload = readPayload(event);
  if (payload === undefined) return 'OUTBOX_PAYLOAD_INVALID';
  if (!hasValidCommonPayload(event, payload)) return 'OUTBOX_PAYLOAD_INVALID';
  if (!hasSupportedContentSchema(event, payload)) return 'OUTBOX_SCHEMA_UNSUPPORTED';
  return undefined;
}

/** 用于消费 Outbox 并以补偿扫描收敛到 PostgreSQL 当前事实。 */
@Injectable()
export class SearchProjectionService {
  private readonly logger = new Logger(SearchProjectionService.name);
  private scanCursor: string | undefined;

  /** 用于接收 Search 模块唯一的数据库写入边界。 */
  constructor(private readonly databaseService: DatabaseService) {}

  /** 用于领取一批当前到期事件，隔离毒事件且不阻塞后续事件。 */
  async processPendingEvents(): Promise<SearchEventProcessingStats> {
    let processedEvents = 0;
    let quarantinedEvents = 0;
    for (let index = 0; index < SEARCH_EVENT_BATCH_SIZE; index += 1) {
      const result = await this.processOneEvent();
      if (result === 'none') break;
      if (result === 'processed') processedEvents += 1;
      if (result === 'quarantined') quarantinedEvents += 1;
    }
    return { processedEvents, quarantinedEvents };
  }

  /** 用于修复一页缺失、过期或生命周期失效的文档投影。 */
  async scanCurrentDocuments(): Promise<SearchProjectionScanStats> {
    const candidates = await this.databaseService.client
      .transaction()
      .execute((transaction) => findScanCandidates(transaction, this.scanCursor));
    let projectedDocuments = 0;
    for (const candidate of candidates) {
      try {
        const projected = await this.databaseService.client
          .transaction()
          .execute((transaction) => projectScanCandidate(transaction, candidate));
        if (projected) projectedDocuments += 1;
      } catch (error: unknown) {
        if (!(error instanceof SearchProjectionPermanentError)) throw error;
        this.logger.warn({
          documentId: candidate.documentId,
          errorCode: error.code,
          event: 'search.scan.document.skipped',
        });
      }
    }
    this.advanceScanCursor(candidates);
    const removedProjections = await this.databaseService.client
      .transaction()
      .execute(removeExtraProjections);
    return { projectedDocuments, removedProjections };
  }

  /** 用于让永久非法候选也推进本进程的稳定分页并在末页后回绕。 */
  private advanceScanCursor(candidates: readonly { documentId: string }[]): void {
    const lastDocumentId = candidates.at(-1)?.documentId;
    this.scanCursor =
      lastDocumentId === undefined || candidates.length < SEARCH_EVENT_BATCH_SIZE
        ? undefined
        : lastDocumentId;
  }

  /** 用于在单事务内领取并完成或隔离一条事件，暂时失败则回滚投影。 */
  private async processOneEvent(): Promise<ProcessOneResult> {
    let claimedEventId: string | undefined;
    try {
      return await this.databaseService.client.transaction().execute(async (transaction) => {
        const event = await claimPendingEvent(transaction);
        if (event === undefined) return 'none';
        claimedEventId = event.id;
        const invalidCode = validateEvent(event);
        if (invalidCode !== undefined) {
          await quarantineEvent(transaction, event.id, invalidCode);
          return 'quarantined';
        }
        try {
          await applyClaimedEvent(transaction, event);
        } catch (error: unknown) {
          if (error instanceof SearchProjectionPermanentError) {
            await quarantineEvent(transaction, event.id, error.code);
            return 'quarantined';
          }
          throw error;
        }
        await markEventProcessed(transaction, event.id);
        return 'processed';
      });
    } catch (error: unknown) {
      if (claimedEventId === undefined) throw error;
      const quarantined = await this.recordRetry(claimedEventId);
      return quarantined ? 'quarantined' : 'retry_scheduled';
    }
  }

  /** 用于在投影事务回滚后独立增加尝试次数并安排有限指数退避。 */
  private async recordRetry(eventId: string): Promise<boolean> {
    const { sql } = await import('kysely');
    const result = await sql<{ failed_at: Date | null }>`UPDATE outbox_events SET
        attempt_count = attempt_count + 1,
        available_at = now() + make_interval(secs => power(2, least(attempt_count, 8))::int),
        failed_at = CASE WHEN attempt_count + 1 >= ${SEARCH_RETRY_LIMIT} THEN now() ELSE NULL END,
        last_error_code = 'SEARCH_PROJECTION_RETRYABLE'
      WHERE id = ${eventId}::uuid AND processed_at IS NULL AND failed_at IS NULL
      RETURNING failed_at`.execute(this.databaseService.client);
    const failedAt = result.rows[0]?.failed_at;
    return failedAt !== null && failedAt !== undefined;
  }
}
