/** @fileoverview Defines the exact owner-scoped knowledge-base summary projection. */

import type { KnowledgeBaseSummary } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { NotFoundException } from '@nestjs/common';
import type { Kysely, Transaction } from 'kysely' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database/database.types';

export interface KnowledgeBaseProjectionRow {
  description: string;
  documentCount: unknown;
  id: string;
  kind: 'news' | 'normal' | 'tutorial';
  name: string;
  updatedAt: string;
  updatedAtMicros: string;
  version: number;
}

/** Converts PostgreSQL count text without admitting overflow or invalid values. */
function parseDocumentCount(value: unknown): number {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/u.test(value)) {
    throw new TypeError('Database returned an invalid document count');
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('Database document count exceeds the supported range');
  }
  return count;
}

/** Maps a database projection to the exact public summary contract. */
export function toKnowledgeBaseSummary(row: KnowledgeBaseProjectionRow): KnowledgeBaseSummary {
  return {
    description: row.description,
    documentCount: parseDocumentCount(row.documentCount),
    id: row.id,
    kind: row.kind,
    name: row.name,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

/** Reads one active knowledge base without disclosing missing or foreign records. */
export async function readActiveKnowledgeBaseSummary(
  executor: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>,
  id: string,
  ownerId: string,
): Promise<KnowledgeBaseSummary> {
  const { sql } = await import('kysely');
  const result = await sql<KnowledgeBaseProjectionRow>`
    SELECT kb.id, kb.name, kb.description, kb.kind, kb.version,
      to_char(kb.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "updatedAt",
      (extract(epoch FROM kb.updated_at) * 1000000)::bigint::text AS "updatedAtMicros",
      (SELECT count(*) FROM documents d
        WHERE d.knowledge_base_id = kb.id AND d.owner_id = ${ownerId}::uuid
          AND d.deleted_at IS NULL)::text AS "documentCount"
    FROM knowledge_bases kb
    WHERE kb.id = ${id}::uuid AND kb.owner_id = ${ownerId}::uuid
      AND kb.deleted_at IS NULL
  `.execute(executor);
  const row = result.rows[0];
  if (row === undefined) throw new NotFoundException();
  return toKnowledgeBaseSummary(row);
}
