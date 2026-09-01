/** @fileoverview 执行所有者反向链接只读查询并标注失效来源。 */

import type { Kysely, Sql } from 'kysely' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database/database.types';

/** 单条反向链接来源的公开投影，来源已删时标题为 null。 */
export interface BacklinkRow {
  readonly blockId: string | null;
  readonly documentId: string;
  readonly documentTitle: string | null;
  readonly sourceDeleted: boolean;
}

const BACKLINKS_LIMIT = 50;

/** 用于跨 CommonJS API 边界加载 Kysely ESM SQL 标签。 */
async function loadSql(): Promise<Sql> {
  return (await import('kysely')).sql;
}

/** 用于读取指向当前文档且来源仍可判定的反向链接，来源被删时保留行并标注。 */
export async function readBacklinks(
  database: Kysely<DatabaseSchema>,
  ownerId: string,
  documentId: string,
): Promise<readonly BacklinkRow[]> {
  const sql = await loadSql();
  const result = await sql<BacklinkRow>`
    SELECT l.source_document_id AS "documentId", l.source_block_id AS "blockId",
      src.title AS "documentTitle",
      (src.id IS NULL OR src.deleted_at IS NOT NULL) AS "sourceDeleted"
    FROM document_links l
    JOIN documents target ON target.id = l.target_document_id
      AND target.owner_id = ${ownerId}::uuid AND target.deleted_at IS NULL
    LEFT JOIN documents src ON src.id = l.source_document_id
    WHERE l.target_document_id = ${documentId}::uuid
    ORDER BY l.source_document_id
    LIMIT ${BACKLINKS_LIMIT}
  `.execute(database);
  return result.rows;
}
