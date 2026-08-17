/** @fileoverview 定义严格限定所有者的文档投影与详情读取查询。 */

import type { DocumentDetail, DocumentTreeItem } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { NotFoundException } from '@nestjs/common';
import type { Kysely, RawBuilder, Sql, Transaction } from 'kysely' with {
  'resolution-mode': 'import',
};

import type { DatabaseSchema } from '../database/database.types';

export interface DocumentTreeRow {
  childCount: unknown;
  id: string;
  title: string;
  updatedAt: string;
  version: number;
}

export interface DocumentDetailRow extends DocumentTreeRow {
  knowledgeBaseId: string;
  parentId: string | null;
}

/** 用于转换 PostgreSQL 计数字符串并拒绝溢出或非法值。 */
function parseChildCount(value: unknown): number {
  if (typeof value !== 'string' || !/^(0|[1-9]\d*)$/u.test(value)) {
    throw new TypeError('Database returned an invalid child count');
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new RangeError('Database child count exceeds the supported range');
  }
  return count;
}

/** 用于将数据库投影映射为严格公开树节点契约。 */
export function toDocumentTreeItem(row: DocumentTreeRow): DocumentTreeItem {
  return {
    childCount: parseChildCount(row.childCount),
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

/** 用于将数据库投影映射为严格公开详情契约。 */
export function toDocumentDetail(row: DocumentDetailRow): DocumentDetail {
  return {
    childCount: parseChildCount(row.childCount),
    id: row.id,
    knowledgeBaseId: row.knowledgeBaseId,
    parentId: row.parentId,
    title: row.title,
    updatedAt: row.updatedAt,
    version: row.version,
  };
}

/** 用于生成命中父级位置索引且限定所有者的活跃子节点计数子查询。 */
export function childCountSubquery(sql: Sql, ownerId: string): RawBuilder<string> {
  return sql`(SELECT count(*) FROM documents c
    WHERE c.parent_id = d.id AND c.knowledge_base_id = d.knowledge_base_id
      AND c.owner_id = ${ownerId}::uuid AND c.deleted_at IS NULL)::text`;
}

/** 用于读取有效文档详情且不泄露缺失、他人或已删除记录。 */
export async function readActiveDocumentDetail(
  executor: Kysely<DatabaseSchema> | Transaction<DatabaseSchema>,
  id: string,
  ownerId: string,
): Promise<DocumentDetail> {
  const { sql } = await import('kysely');
  const result = await sql<DocumentDetailRow>`
    SELECT d.id, d.title, d.version,
      d.knowledge_base_id AS "knowledgeBaseId", d.parent_id AS "parentId",
      to_char(d.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "updatedAt",
      ${childCountSubquery(sql, ownerId)} AS "childCount"
    FROM documents d
    JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id AND kb.owner_id = d.owner_id
    WHERE d.id = ${id}::uuid AND d.owner_id = ${ownerId}::uuid
      AND d.deleted_at IS NULL AND kb.deleted_at IS NULL
  `.execute(executor);
  const row = result.rows[0];
  if (row === undefined) throw new NotFoundException();
  return toDocumentDetail(row);
}
