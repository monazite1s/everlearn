/** @fileoverview 定义严格限定所有者的修订投影与快照读取查询。 */

import type {
  DocumentRevisionDetail,
  DocumentRevisionListItem,
  DocumentRevisionSource,
} from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { NotFoundException } from '@nestjs/common';
import type { Kysely, Transaction } from 'kysely' with {
  'resolution-mode': 'import',
};

import type { DatabaseSchema } from '../database/database.types';
import type { RevisionCursorPayload } from './list-revisions-query.dto';

/** 列表条目摘要长度，按纯文本前缀截取。 */
export const REVISION_SNIPPET_LENGTH = 200;

/** 用于限定单文档修订读取的所有者与目标范围。 */
export interface RevisionReadScope {
  readonly id: string;
  readonly ownerId: string;
  readonly revisionNumber: number;
}

/** 用于承载修订列表查询的目标文档与分页参数。 */
export interface RevisionListScope {
  readonly cursor?: RevisionCursorPayload;
  readonly id: string;
  readonly limit: number;
  readonly ownerId: string;
}

export interface RevisionItemRow {
  createdAt: string;
  revisionNumber: number;
  snippet: string;
  source: string;
  title: string;
}

export interface RevisionDetailRow extends RevisionItemRow {
  contentJson: unknown;
  plainText: string;
  schemaVersion: number;
}

/** 用于从共享契约异步加载修订来源闭集。 */
export async function loadRevisionSources(): Promise<ReadonlySet<string>> {
  const contracts = await import('@everlearn/contracts');
  return new Set<string>(contracts.DOCUMENT_REVISION_SOURCES);
}

/** 用于把数据库来源值收窄到契约受控枚举。 */
function toRevisionSource(value: string, sources: ReadonlySet<string>): DocumentRevisionSource {
  if (!sources.has(value)) {
    throw new TypeError('Database returned an invalid revision source');
  }
  return value as DocumentRevisionSource;
}

/** 用于将数据库投影映射为严格公开修订列表条目。 */
export function toDocumentRevisionListItem(
  row: RevisionItemRow,
  sources: ReadonlySet<string>,
): DocumentRevisionListItem {
  return {
    createdAt: row.createdAt,
    revisionNumber: row.revisionNumber,
    snippet: row.snippet,
    source: toRevisionSource(row.source, sources),
    title: row.title,
  };
}

/** 用于将数据库投影映射为附带全文的公开修订详情契约。 */
export function toDocumentRevisionDetail(
  row: RevisionDetailRow,
  sources: ReadonlySet<string>,
): DocumentRevisionDetail {
  return {
    contentJson: row.contentJson,
    createdAt: row.createdAt,
    plainText: row.plainText,
    revisionNumber: row.revisionNumber,
    schemaVersion: row.schemaVersion,
    snippet: row.snippet,
    source: toRevisionSource(row.source, sources),
    title: row.title,
  };
}

/** 用于按修订号倒序列出有效文档的修订摘要与续页游标行。 */
export async function listRevisionRows(
  executor: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>,
  scope: RevisionListScope,
): Promise<readonly RevisionItemRow[]> {
  const { sql } = await import('kysely');
  const cursorPredicate =
    scope.cursor === undefined
      ? sql``
      : sql`AND r.revision_number < ${scope.cursor.revisionNumber}`;
  const result = await sql<RevisionItemRow>`
    SELECT r.revision_number AS "revisionNumber", r.source, r.title,
      left(r.plain_text, ${REVISION_SNIPPET_LENGTH}) AS "snippet",
      to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"
    FROM document_revisions r
    JOIN documents d ON d.id = r.document_id AND d.owner_id = r.owner_id
    JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id AND kb.owner_id = d.owner_id
    WHERE r.document_id = ${scope.id}::uuid AND r.owner_id = ${scope.ownerId}::uuid
      AND d.deleted_at IS NULL AND kb.deleted_at IS NULL
      ${cursorPredicate}
    ORDER BY r.revision_number DESC
    LIMIT ${scope.limit + 1}
  `.execute(executor);
  return result.rows;
}

/** 用于读取单个修订的全文快照且统一隐藏缺失目标。 */
export async function readRevisionDetail(
  executor: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>,
  scope: RevisionReadScope,
): Promise<DocumentRevisionDetail> {
  const { sql } = await import('kysely');
  const result = await sql<RevisionDetailRow>`
    SELECT r.revision_number AS "revisionNumber", r.source, r.title,
      left(r.plain_text, ${REVISION_SNIPPET_LENGTH}) AS "snippet", r.plain_text AS "plainText",
      r.schema_version AS "schemaVersion", r.content_json AS "contentJson",
      to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"
    FROM document_revisions r
    JOIN documents d ON d.id = r.document_id AND d.owner_id = r.owner_id
    JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id AND kb.owner_id = d.owner_id
    WHERE r.document_id = ${scope.id}::uuid AND r.owner_id = ${scope.ownerId}::uuid
      AND r.revision_number = ${scope.revisionNumber}
      AND d.deleted_at IS NULL AND kb.deleted_at IS NULL
  `.execute(executor);
  const row = result.rows[0];
  if (row === undefined) throw new NotFoundException();
  const sources = await loadRevisionSources();
  return toDocumentRevisionDetail(row, sources);
}

/** 用于读取最新修订并按内容与标题深相等判断是否为重复快照。 */
export async function readLatestRevision(
  executor: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>,
  scope: { contentJson: unknown; id: string; ownerId: string; title: string },
): Promise<(RevisionDetailRow & { contentMatches: boolean }) | undefined> {
  const { sql } = await import('kysely');
  const result = await sql<RevisionDetailRow & { contentMatches: boolean }>`
    SELECT r.revision_number AS "revisionNumber", r.source, r.title,
      left(r.plain_text, ${REVISION_SNIPPET_LENGTH}) AS "snippet", r.plain_text AS "plainText",
      r.schema_version AS "schemaVersion", r.content_json AS "contentJson",
      to_char(r.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt",
      (r.content_json = ${JSON.stringify(scope.contentJson)}::jsonb
        AND r.title = ${scope.title}::text) AS "contentMatches"
    FROM document_revisions r
    WHERE r.document_id = ${scope.id}::uuid AND r.owner_id = ${scope.ownerId}::uuid
    ORDER BY r.revision_number DESC
    LIMIT 1
  `.execute(executor);
  return result.rows[0];
}
