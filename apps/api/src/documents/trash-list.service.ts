/** @fileoverview 实现限定所有者的回收站聚合投影与游标分页。 */

import type { TrashItem, TrashListResponse } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Injectable } from '@nestjs/common';
import type { RawBuilder, Sql } from 'kysely' with {
  'resolution-mode': 'import',
};

import { DatabaseService } from '../database/database.service';
import { LocalIdentityContext } from '../identity/local-identity.context';
import {
  decodeTrashCursor,
  encodeTrashCursor,
  type ListTrashQueryDto,
  type TrashCursorPayload,
} from './list-trash-query.dto';

const DEFAULT_PAGE_LIMIT = 20;
const MICROS_PER_SECOND = 1_000_000n;

export interface TrashRow {
  deletedAt: string;
  deletedAtMicros: string;
  id: string;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  objectType: string;
  purgeScheduledAt: string;
  title: string;
  version: number;
}

/** 用于拆分微秒时间戳，避免 PostgreSQL 接收有损浮点值。 */
function splitEpochMicros(deletedAtMicros: string): readonly [string, string] {
  const micros = BigInt(deletedAtMicros);
  return [(micros / MICROS_PER_SECOND).toString(), (micros % MICROS_PER_SECOND).toString()];
}

/** 用于将数据库投影映射为严格公开回收站条目。 */
function toTrashItem(row: TrashRow): TrashItem {
  if (row.objectType !== 'document' && row.objectType !== 'knowledge-base') {
    throw new TypeError('Database returned an invalid trash object type');
  }
  return {
    deletedAt: row.deletedAt,
    id: row.id,
    knowledgeBaseId: row.knowledgeBaseId,
    knowledgeBaseName: row.knowledgeBaseName,
    objectType: row.objectType,
    purgeScheduledAt: row.purgeScheduledAt,
    title: row.title,
    version: row.version,
  };
}

/** 用于在所有者边界内列出已删知识库与独立删除的文档。 */
@Injectable()
export class TrashListService {
  /** 用于接收共享数据库客户端和可信本地身份上下文。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identityContext: LocalIdentityContext,
  ) {}

  /** 用于按删除时间倒序返回回收站条目与不透明续页游标。 */
  async list(query: ListTrashQueryDto): Promise<TrashListResponse> {
    const { ownerId } = this.identityContext.getActor();
    const { sql } = await import('kysely');
    const { TRASH_RETENTION_DAYS } = await import('@everlearn/contracts');
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const cursor = this.resolveCursor(query.cursor);
    const predicates = cursor === undefined ? undefined : this.buildKeysetPredicates(sql, cursor);
    const result = await sql<TrashRow>`
      SELECT t.id, t."objectType", t.title, t."knowledgeBaseId", t."knowledgeBaseName", t.version,
        to_char(t.deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "deletedAt",
        (extract(epoch FROM t.deleted_at) * 1000000)::bigint::text AS "deletedAtMicros",
        to_char((t.deleted_at + (${TRASH_RETENTION_DAYS}::int * interval '1 day')) AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "purgeScheduledAt"
      FROM (
        SELECT kb.id AS id, 'knowledge-base' AS "objectType", kb.name AS title,
          kb.id AS "knowledgeBaseId", kb.name AS "knowledgeBaseName", kb.version AS version,
          kb.deleted_at AS deleted_at
        FROM knowledge_bases kb
        WHERE kb.owner_id = ${ownerId}::uuid AND kb.deleted_at IS NOT NULL
          ${predicates?.knowledgeBase ?? sql``}
        UNION ALL
        SELECT d.id, 'document', d.title, d.knowledge_base_id, kbd.name, d.version, d.deleted_at
        FROM documents d
        JOIN knowledge_bases kbd ON kbd.id = d.knowledge_base_id AND kbd.owner_id = d.owner_id
        WHERE d.owner_id = ${ownerId}::uuid AND d.deleted_at IS NOT NULL
          AND (
            d.parent_id IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM documents p
              WHERE p.id = d.parent_id AND p.owner_id = d.owner_id AND p.deleted_at IS NOT NULL
            )
          )
          ${predicates?.document ?? sql``}
      ) t
      ORDER BY t.deleted_at DESC, t.id DESC
      LIMIT ${limit + 1}
    `.execute(this.databaseService.client);
    const pageRows = result.rows.slice(0, limit);
    const lastRow = pageRows.at(-1);
    const nextCursor =
      result.rows.length <= limit || lastRow === undefined
        ? null
        : encodeTrashCursor({ deletedAtMicros: lastRow.deletedAtMicros, id: lastRow.id, v: 1 });
    return { items: pageRows.map(toTrashItem), nextCursor };
  }

  /** 用于解析已通过全局 DTO 边界的回收站游标。 */
  private resolveCursor(cursor: string | undefined): TrashCursorPayload | undefined {
    if (cursor === undefined) return;
    const payload = decodeTrashCursor(cursor);
    if (payload === undefined) throw new TypeError('Validated trash cursor is invalid');
    return payload;
  }

  /** 用于为两个聚合分支生成引用各自别名的续页谓词。 */
  private buildKeysetPredicates(
    sql: Sql,
    cursor: TrashCursorPayload,
  ): { document: RawBuilder<unknown>; knowledgeBase: RawBuilder<unknown> } {
    const [seconds, micros] = splitEpochMicros(cursor.deletedAtMicros);
    const timestamp = sql`TIMESTAMPTZ 'epoch'
      + (${seconds}::bigint * interval '1 second')
      + (${micros}::bigint * interval '1 microsecond')`;
    return {
      document: sql`AND (
        d.deleted_at < ${timestamp}
        OR (d.deleted_at = ${timestamp} AND d.id < ${cursor.id}::uuid)
      )`,
      knowledgeBase: sql`AND (
        kb.deleted_at < ${timestamp}
        OR (kb.deleted_at = ${timestamp} AND kb.id < ${cursor.id}::uuid)
      )`,
    };
  }
}
