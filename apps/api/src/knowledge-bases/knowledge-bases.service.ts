/** @fileoverview Implements owner-scoped knowledge-base creation and summary reads. */

import { randomUUID } from 'node:crypto';

import type { KnowledgeBaseListResponse, KnowledgeBaseSummary } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Injectable } from '@nestjs/common';
import type { Sql } from 'kysely' with { 'resolution-mode': 'import' };

import { DatabaseService } from '../database/database.service';
import { LocalIdentityContext } from '../local-identity.context';
import type { CreateKnowledgeBaseDto } from './create-knowledge-base.dto';
import {
  readActiveKnowledgeBaseSummary,
  toKnowledgeBaseSummary,
  type KnowledgeBaseProjectionRow,
} from './knowledge-base-summary.query';
import {
  decodeKnowledgeBaseCursor,
  encodeKnowledgeBaseCursor,
  type KnowledgeBaseCursorPayload,
} from './list-knowledge-bases-query.dto';
import type { ListKnowledgeBasesQueryDto } from './list-knowledge-bases-query.dto';

const DEFAULT_PAGE_LIMIT = 20;
const MICROS_PER_SECOND = 1_000_000n;

/** Loads the ESM-only Kysely SQL tag across the API's Node16/CommonJS boundary. */
async function loadSql(): Promise<Sql> {
  return (await import('kysely')).sql;
}

/** Resolves a cursor already accepted by the global DTO boundary. */
function resolveCursor(cursor: string | undefined): KnowledgeBaseCursorPayload | undefined {
  if (cursor === undefined) return;
  const payload = decodeKnowledgeBaseCursor(cursor);
  if (payload === undefined) throw new TypeError('Validated knowledge-base cursor is invalid');
  return payload;
}

/** Splits epoch microseconds so PostgreSQL never receives one lossy floating value. */
function splitEpochMicros(updatedAtMicros: string): readonly [string, string] {
  const micros = BigInt(updatedAtMicros);
  return [(micros / MICROS_PER_SECOND).toString(), (micros % MICROS_PER_SECOND).toString()];
}

/** Persists and reads knowledge-base summaries within the server-resolved owner boundary. */
@Injectable()
export class KnowledgeBasesService {
  /** Receives the shared database client and trusted local identity context. */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identityContext: LocalIdentityContext,
  ) {}

  /** Creates one normal knowledge base and returns only committed database facts. */
  async create(input: CreateKnowledgeBaseDto): Promise<KnowledgeBaseSummary> {
    const sql = await loadSql();
    const { ownerId } = this.identityContext.getActor();
    const result = await sql<KnowledgeBaseProjectionRow>`
      INSERT INTO knowledge_bases (id, owner_id, name, description, kind)
      VALUES (${randomUUID()}::uuid, ${ownerId}::uuid, ${input.name}, ${input.description ?? ''}, 'normal')
      RETURNING id, name, description, kind, version,
        to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "updatedAt",
        (extract(epoch FROM updated_at) * 1000000)::bigint::text AS "updatedAtMicros",
        0::bigint::text AS "documentCount"
    `.execute(this.databaseService.client);
    const row = result.rows[0];
    if (row === undefined) throw new Error('Knowledge-base insert returned no row');
    return toKnowledgeBaseSummary(row);
  }

  /** Lists active owner records in stable recent-activity cursor order. */
  async list(query: ListKnowledgeBasesQueryDto): Promise<KnowledgeBaseListResponse> {
    const sql = await loadSql();
    const { ownerId } = this.identityContext.getActor();
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const cursor = resolveCursor(query.cursor);
    const timestamp = cursor === undefined ? undefined : splitEpochMicros(cursor.updatedAtMicros);
    const cursorTimestamp =
      timestamp === undefined
        ? undefined
        : sql`TIMESTAMPTZ 'epoch'
            + (${timestamp[0]}::bigint * interval '1 second')
            + (${timestamp[1]}::bigint * interval '1 microsecond')`;
    const cursorPredicate =
      cursor === undefined || cursorTimestamp === undefined
        ? sql``
        : sql`AND (
            kb.updated_at < ${cursorTimestamp}
            OR (kb.updated_at = ${cursorTimestamp} AND kb.id > ${cursor.id}::uuid)
          )`;
    const result = await sql<KnowledgeBaseProjectionRow>`
      SELECT kb.id, kb.name, kb.description, kb.kind, kb.version,
        to_char(kb.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "updatedAt",
        (extract(epoch FROM kb.updated_at) * 1000000)::bigint::text AS "updatedAtMicros",
        (SELECT count(*) FROM documents d
          WHERE d.knowledge_base_id = kb.id AND d.owner_id = ${ownerId}::uuid
            AND d.deleted_at IS NULL)::text AS "documentCount"
      FROM knowledge_bases kb
      WHERE kb.owner_id = ${ownerId}::uuid AND kb.deleted_at IS NULL
      ${cursorPredicate}
      ORDER BY kb.updated_at DESC, kb.id ASC
      LIMIT ${limit + 1}
    `.execute(this.databaseService.client);
    const pageRows = result.rows.slice(0, limit);
    const lastRow = pageRows.at(-1);
    const nextCursor =
      result.rows.length <= limit || lastRow === undefined
        ? null
        : encodeKnowledgeBaseCursor({
            id: lastRow.id,
            updatedAtMicros: lastRow.updatedAtMicros,
            v: 1,
          });
    return { items: pageRows.map(toKnowledgeBaseSummary), nextCursor };
  }

  /** Reads one active owner record while hiding missing and foreign resources alike. */
  async read(id: string): Promise<KnowledgeBaseSummary> {
    const { ownerId } = this.identityContext.getActor();
    return readActiveKnowledgeBaseSummary(this.databaseService.client, id, ownerId);
  }
}
