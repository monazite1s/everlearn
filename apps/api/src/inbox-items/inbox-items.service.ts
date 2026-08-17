/** @fileoverview 实现限定所有者的 Inbox 待处理记录写入、列出与软删除。 */

import { randomUUID } from 'node:crypto';

import type { InboxItemListResponse, InboxItemSummary } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Sql } from 'kysely' with { 'resolution-mode': 'import' };

import { DatabaseService } from '../database/database.service';
import { LocalIdentityContext } from '../identity/local-identity.context';
import type { CreateInboxItemDto } from './create-inbox-item.dto';
import {
  decodeInboxItemCursor,
  encodeInboxItemCursor,
  type InboxItemCursorPayload,
  type ListInboxItemsQueryDto,
} from './list-inbox-items-query.dto';

const DEFAULT_PAGE_LIMIT = 20;
const MICROS_PER_SECOND = 1_000_000n;

interface InboxItemProjectionRow {
  content: string;
  createdAt: string;
  createdAtMicros: string;
  id: string;
  kind: 'text' | 'url';
}

/** 用于跨 API 的 CommonJS 边界加载 Kysely ESM SQL 标签。 */
async function loadSql(): Promise<Sql> {
  return (await import('kysely')).sql;
}

/** 用于解析已通过全局 DTO 边界的游标。 */
function resolveCursor(cursor: string | undefined): InboxItemCursorPayload | undefined {
  if (cursor === undefined) return;
  const payload = decodeInboxItemCursor(cursor);
  if (payload === undefined) throw new TypeError('Validated inbox-item cursor is invalid');
  return payload;
}

/** 用于拆分微秒时间戳，避免 PostgreSQL 接收有损浮点值。 */
function splitEpochMicros(createdAtMicros: string): readonly [string, string] {
  const micros = BigInt(createdAtMicros);
  return [(micros / MICROS_PER_SECOND).toString(), (micros % MICROS_PER_SECOND).toString()];
}

/** 用于将数据库投影映射为严格公开的待处理记录契约。 */
function toInboxItemSummary(row: InboxItemProjectionRow): InboxItemSummary {
  return { content: row.content, createdAt: row.createdAt, id: row.id, kind: row.kind };
}

/** 用于在服务端所有者边界内写入、列出和软删除待处理记录。 */
@Injectable()
export class InboxItemsService {
  /** 用于接收共享数据库客户端和可信本地身份上下文。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identityContext: LocalIdentityContext,
  ) {}

  /** 用于创建 pending 状态的互斥载荷记录并只返回已提交事实。 */
  async create(input: CreateInboxItemDto): Promise<InboxItemSummary> {
    const sql = await loadSql();
    const { ownerId } = this.identityContext.getActor();
    const kind = input.url === undefined ? 'text' : 'url';
    const content = kind === 'url' ? input.url : input.text;
    if (content === undefined) throw new TypeError('Validated inbox payload is missing');
    const result = await sql<InboxItemProjectionRow>`
      INSERT INTO inbox_items (id, owner_id, kind, content)
      VALUES (${randomUUID()}::uuid, ${ownerId}::uuid, ${kind}::text, ${content})
      RETURNING id, kind, content,
        to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",
        (extract(epoch FROM created_at) * 1000000)::bigint::text AS "createdAtMicros"
    `.execute(this.databaseService.client);
    const row = result.rows[0];
    if (row === undefined) throw new Error('Inbox-item insert returned no row');
    return toInboxItemSummary(row);
  }

  /** 用于按创建时间倒序游标列出当前所有者的待处理记录。 */
  async list(query: ListInboxItemsQueryDto): Promise<InboxItemListResponse> {
    const sql = await loadSql();
    const { ownerId } = this.identityContext.getActor();
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const cursor = resolveCursor(query.cursor);
    const timestamp = cursor === undefined ? undefined : splitEpochMicros(cursor.createdAtMicros);
    const cursorTimestamp =
      timestamp === undefined
        ? undefined
        : sql`TIMESTAMPTZ 'epoch'
            + (${timestamp[0]}::bigint * interval '1 second')
            + (${timestamp[1]}::bigint * interval '1 microsecond')`;
    const cursorPredicate =
      cursor === undefined || cursorTimestamp === undefined
        ? sql``
        : sql`AND (i.created_at < ${cursorTimestamp}
            OR (i.created_at = ${cursorTimestamp} AND i.id > ${cursor.id}::uuid))`;
    const result = await sql<InboxItemProjectionRow>`
      SELECT i.id, i.kind, i.content,
        to_char(i.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",
        (extract(epoch FROM i.created_at) * 1000000)::bigint::text AS "createdAtMicros"
      FROM inbox_items i
      WHERE i.owner_id = ${ownerId}::uuid AND i.status = 'pending' AND i.deleted_at IS NULL
        ${cursorPredicate}
      ORDER BY i.created_at DESC, i.id ASC
      LIMIT ${limit + 1}
    `.execute(this.databaseService.client);
    const pageRows = result.rows.slice(0, limit);
    const lastRow = pageRows.at(-1);
    const nextCursor =
      result.rows.length <= limit || lastRow === undefined
        ? null
        : encodeInboxItemCursor({ createdAtMicros: lastRow.createdAtMicros, id: lastRow.id, v: 1 });
    return { items: pageRows.map(toInboxItemSummary), nextCursor };
  }

  /** 用于软删除待处理记录并统一隐藏缺失、他人、已删与已转换记录。 */
  async remove(id: string): Promise<void> {
    const { ownerId } = this.identityContext.getActor();
    const sql = await loadSql();
    const result = await this.databaseService.client
      .updateTable('inbox_items')
      .set({ deleted_at: sql`transaction_timestamp()`, updated_at: sql`transaction_timestamp()` })
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .where('status', '=', 'pending')
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    if (result.numUpdatedRows <= 0n) throw new NotFoundException();
  }
}
