/** @fileoverview 执行参数化全文检索、keyset 排序、祖先投影与范围索引状态查询。 */

import type { Kysely, Sql } from 'kysely' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database/database.types';
import type { NormalizedSearchQuery, SearchCursorPayload } from './search-query.dto';
import type { RankedSearchRow, SearchAncestorRow } from './search-query.model';
import { toVectorLiteral } from '../ai/embedding';

const MICROS_PER_SECOND = 1_000_000n;

/** 用于跨 CommonJS API 边界加载 Kysely ESM SQL 标签。 */
async function loadSql(): Promise<Sql> {
  return (await import('kysely')).sql;
}

/** 用于验证当前库范围确实属于当前操作者且仍有效。 */
export async function activeKnowledgeBaseExists(
  database: Kysely<DatabaseSchema>,
  ownerId: string,
  knowledgeBaseId: string,
): Promise<boolean> {
  const row = await database
    .selectFrom('knowledge_bases')
    .select('id')
    .where('id', '=', knowledgeBaseId)
    .where('owner_id', '=', ownerId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();
  return row !== undefined;
}

/** 用于把微秒 epoch 拆为 PostgreSQL 可无损接收的整数部分。 */
function splitEpochMicros(value: string): readonly [string, string] {
  const micros = BigInt(value);
  return [(micros / MICROS_PER_SECOND).toString(), (micros % MICROS_PER_SECOND).toString()];
}

/** 用于把用户文本转为 PostgreSQL ILIKE 的纯字面子串模式。 */
function literalSubstringPattern(query: string): string {
  return `%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

/** 用于按可选范围和严格更新时间构造候选文档过滤。 */
function documentFilters(
  sql: Sql,
  query: NormalizedSearchQuery,
): {
  readonly knowledgeBase: ReturnType<Sql>;
  readonly tagFilter: ReturnType<Sql>;
  readonly updatedAfter: ReturnType<Sql>;
} {
  const tagIds = query.tagIds ?? [];
  return {
    tagFilter:
      tagIds.length === 0
        ? sql``
        : sql`AND EXISTS (SELECT 1 FROM document_tags dt
            WHERE dt.document_id = d.id AND dt.tag_id IN (${sql.join(
              tagIds.map((id) => sql`${id}::uuid`),
            )}))`,
    knowledgeBase:
      query.scope === 'knowledgeBase'
        ? sql`AND d.knowledge_base_id = ${query.knowledgeBaseId}::uuid`
        : sql``,
    updatedAfter:
      query.updatedAfter === null
        ? sql``
        : sql`AND d.updated_at > ${query.updatedAfter}::timestamptz`,
  };
}

/** 用于按完整固定排序元组构造普通 keyset 继续条件。 */
function cursorFilter(sql: Sql, cursor: SearchCursorPayload | undefined): ReturnType<Sql> {
  if (cursor === undefined) return sql``;
  const [seconds, micros] = splitEpochMicros(cursor.updatedAtMicros);
  const timestamp = sql`TIMESTAMPTZ 'epoch'
    + (${seconds}::bigint * interval '1 second')
    + (${micros}::bigint * interval '1 microsecond')`;
  return sql`WHERE rank_tier > ${cursor.rankTier}
    OR (rank_tier = ${cursor.rankTier} AND rank_score < ${cursor.rankScore}::numeric)
    OR (rank_tier = ${cursor.rankTier} AND rank_score = ${cursor.rankScore}::numeric
      AND updated_at < ${timestamp})
    OR (rank_tier = ${cursor.rankTier} AND rank_score = ${cursor.rankScore}::numeric
      AND updated_at = ${timestamp} AND document_id > ${cursor.documentId}::uuid)`;
}

export interface RankedSearchRequest {
  readonly cursor: SearchCursorPayload | undefined;
  readonly limit: number;
  readonly ownerId: string;
  readonly query: NormalizedSearchQuery;
}

/** 用于构造所有者、生命周期和当前版本正文候选 CTE。 */
function candidateCtes(
  sql: Sql,
  request: RankedSearchRequest,
  filters: ReturnType<typeof documentFilters>,
): ReturnType<Sql> {
  const { ownerId, query } = request;
  return sql`params AS (
    SELECT ${query.query}::text AS literal_query,
      ${literalSubstringPattern(query.query)}::text AS literal_pattern,
      plainto_tsquery('pg_catalog.simple'::regconfig, ${query.query}) AS ts_query
  ), visible_documents AS (
    SELECT d.id, d.owner_id, d.knowledge_base_id, d.title, d.version, d.updated_at,
      kb.name AS knowledge_base_name
    FROM documents d
    JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id AND kb.owner_id = d.owner_id
    WHERE d.owner_id = ${ownerId}::uuid AND d.deleted_at IS NULL AND kb.deleted_at IS NULL
      ${filters.knowledgeBase} ${filters.tagFilter} ${filters.updatedAfter}
  ), ranked_blocks AS (
    SELECT sb.document_id, sb.block_id, sb.block_order, sb.text, sb.heading_path,
      CASE WHEN sb.search_vector @@ p.ts_query THEN 5 ELSE 6 END AS rank_tier,
      round((CASE WHEN sb.search_vector @@ p.ts_query THEN ts_rank_cd(sb.search_vector, p.ts_query)
        ELSE public.similarity(lower(sb.text), p.literal_query) END)::numeric, 6) AS rank_score
    FROM visible_documents d
    JOIN search_document_projections projection
      ON projection.document_id = d.id AND projection.owner_id = d.owner_id
      AND projection.indexed_document_version = d.version
    JOIN search_blocks sb ON sb.document_id = d.id AND sb.owner_id = d.owner_id
      AND sb.document_version = d.version
    CROSS JOIN params p
    WHERE ${query.field} <> 'title'
      AND (sb.search_vector @@ p.ts_query OR sb.text ILIKE p.literal_pattern)
  ), best_blocks AS (
    SELECT DISTINCT ON (document_id) document_id, block_id, text, heading_path,
      rank_tier, rank_score
    FROM ranked_blocks
    ORDER BY document_id, rank_tier, rank_score DESC, block_order, block_id
  )`;
}

/** 用于构造六级标题正文去重、判别与量化排序 CTE。 */
function rankingCtes(sql: Sql, query: NormalizedSearchQuery): ReturnType<Sql> {
  return sql`matches AS (
    SELECT d.*, block.block_id, block.text, block.heading_path,
      block.rank_tier AS content_tier, block.rank_score AS content_score,
      lower(d.title) = p.literal_query AS title_exact,
      left(lower(d.title), char_length(p.literal_query)) = p.literal_query AS title_prefix,
      to_tsvector('pg_catalog.simple'::regconfig, d.title) @@ p.ts_query AS title_fts,
      d.title ILIKE p.literal_pattern AS title_literal
    FROM visible_documents d CROSS JOIN params p
    LEFT JOIN best_blocks block ON block.document_id = d.id
  ), ranked_documents AS (
    SELECT id AS document_id, title AS document_title, version AS document_version, updated_at,
      knowledge_base_id, knowledge_base_name, block_id, text, heading_path,
      CASE WHEN ${query.field} = 'content' THEN 'content'
        WHEN ${query.field} = 'title' THEN 'title'
        WHEN (title_exact OR title_prefix OR title_fts OR title_literal) AND block_id IS NOT NULL
          THEN 'both' WHEN block_id IS NOT NULL THEN 'content' ELSE 'title' END AS matched_field,
      CASE WHEN ${query.field} <> 'content' AND title_exact THEN 1
        WHEN ${query.field} <> 'content' AND title_prefix THEN 2
        WHEN ${query.field} <> 'content' AND title_fts THEN 3
        WHEN ${query.field} <> 'content' AND title_literal THEN 4 ELSE content_tier END AS rank_tier,
      CASE WHEN ${query.field} <> 'content' AND title_exact THEN 1::numeric
        WHEN ${query.field} <> 'content' AND title_prefix
          THEN round(public.similarity(lower(title), p.literal_query)::numeric, 6)
        WHEN ${query.field} <> 'content' AND title_fts
          THEN round(ts_rank_cd(to_tsvector('pg_catalog.simple'::regconfig, title), p.ts_query)::numeric, 6)
        WHEN ${query.field} <> 'content' AND title_literal
          THEN round(public.similarity(lower(title), p.literal_query)::numeric, 6)
        ELSE content_score END AS rank_score
    FROM matches CROSS JOIN params p
    WHERE (${query.field} = 'title' AND (title_exact OR title_prefix OR title_fts OR title_literal))
      OR (${query.field} = 'content' AND block_id IS NOT NULL)
      OR (${query.field} = 'all' AND ((title_exact OR title_prefix OR title_fts OR title_literal)
        OR block_id IS NOT NULL))
  ), quantized AS (SELECT *, round(rank_score, 6) AS quantized_score FROM ranked_documents)`;
}

/** 用于按文档聚合六级相关度并选取当前版本最佳正文块。 */
export async function readRankedSearchRows(
  database: Kysely<DatabaseSchema>,
  request: RankedSearchRequest,
): Promise<readonly RankedSearchRow[]> {
  const sql = await loadSql();
  const candidates = candidateCtes(sql, request, documentFilters(sql, request.query));
  const rankings = rankingCtes(sql, request.query);
  const afterCursor = cursorFilter(sql, request.cursor);
  const result = await sql<RankedSearchRow>`WITH ${candidates}, ${rankings}, page AS (
    SELECT * FROM quantized ${afterCursor}
    ORDER BY rank_tier, quantized_score DESC, updated_at DESC, document_id ASC
    LIMIT ${request.limit + 1}
  ) SELECT document_id, document_title, document_version, knowledge_base_id, knowledge_base_name,
    block_id, text, heading_path, matched_field, rank_tier::integer AS rank_tier,
    to_char(quantized_score, 'FM999999990.000000') AS rank_score,
    to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS updated_at,
    (extract(epoch FROM updated_at) * 1000000)::bigint::text AS updated_at_micros
  FROM page ORDER BY rank_tier, quantized_score DESC, updated_at DESC, document_id ASC`.execute(
    database,
  );
  return result.rows;
}

export interface HybridRecallRequest {
  readonly knowledgeBaseId: string;
  readonly limit: number;
  readonly ownerId: string;
  readonly query: string;
  readonly queryEmbedding: readonly number[] | null;
}

export interface HybridRecallRow {
  readonly block_id: string;
  readonly document_id: string;
  readonly document_title: string;
  readonly heading_path: readonly string[];
  readonly text: string;
}

const RRF_CONSTANT_K = 60;

/** 用于以倒数排名融合多路候选并返回去重后的键序（纯函数便于单元验证）。 */
export function fuseReciprocalRankFusion(
  rankings: readonly (readonly string[])[],
  limit: number = Number.MAX_SAFE_INTEGER,
  k: number = RRF_CONSTANT_K,
): readonly string[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    for (const [index, key] of ranking.entries()) {
      scores.set(key, (scores.get(key) ?? 0) + 1 / (k + index + 1));
    }
  }
  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([key]) => key);
}

/** 用于构造问答混合召回共享的参数、可见文档与当前版本块 CTE。 */
function hybridCandidateCtes(sql: Sql, request: HybridRecallRequest): ReturnType<Sql> {
  return sql`qa_params AS (
    SELECT plainto_tsquery('pg_catalog.simple'::regconfig, ${request.query}) AS ts_query,
      ${literalSubstringPattern(request.query)}::text AS literal_pattern
  ), qa_documents AS (
    SELECT d.id, d.title, d.version
    FROM documents d
    JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id AND kb.owner_id = d.owner_id
    WHERE d.owner_id = ${request.ownerId}::uuid AND d.deleted_at IS NULL
      AND kb.deleted_at IS NULL AND d.knowledge_base_id = ${request.knowledgeBaseId}::uuid
  ), qa_blocks AS (
    SELECT sb.document_id, sb.block_id, sb.text, sb.heading_path, sb.search_vector, sb.embedding,
      d.title AS document_title
    FROM qa_documents d
    JOIN search_document_projections projection
      ON projection.document_id = d.id AND projection.owner_id = ${request.ownerId}::uuid
      AND projection.indexed_document_version = d.version
    JOIN search_blocks sb ON sb.document_id = d.id AND sb.owner_id = ${request.ownerId}::uuid
      AND sb.document_version = d.version
  )`;
}

/** 用于按所有权、生命周期与当前版本约束读取并融合 FTS 与向量两路问答候选。 */
export async function readHybridRecallRows(
  database: Kysely<DatabaseSchema>,
  request: HybridRecallRequest,
): Promise<readonly HybridRecallRow[]> {
  const sql = await loadSql();
  const candidateLimit = request.limit * 4;
  const vectorRanked =
    request.queryEmbedding === null
      ? sql``
      : sql`, vector_ranked AS (
    SELECT document_id, block_id, text, heading_path, document_title
    FROM qa_blocks
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${toVectorLiteral(request.queryEmbedding)}::vector
    LIMIT ${candidateLimit}
  )`;
  const result = await sql<HybridRecallRow & { source: string }>`WITH ${hybridCandidateCtes(
    sql,
    request,
  )}, fts_ranked AS (
    SELECT document_id, block_id, text, heading_path, document_title
    FROM qa_blocks CROSS JOIN qa_params p
    WHERE search_vector @@ p.ts_query OR text ILIKE p.literal_pattern
    ORDER BY ts_rank_cd(search_vector, p.ts_query) DESC, document_id, block_id
    LIMIT ${candidateLimit}
  )${vectorRanked}
  SELECT 'fts' AS source, document_id, block_id, text, heading_path, document_title FROM fts_ranked
  ${
    request.queryEmbedding === null
      ? sql``
      : sql`UNION ALL
  SELECT 'vector' AS source, document_id, block_id, text, heading_path, document_title
    FROM vector_ranked`
  }`.execute(database);
  const rowsByKey = new Map(
    result.rows.map((row) => [`${row.document_id}\u0000${row.block_id}`, row as HybridRecallRow]),
  );
  const rankings = ['fts', 'vector']
    .map((source) =>
      result.rows
        .filter((row) => row.source === source)
        .map((row) => `${row.document_id}\u0000${row.block_id}`),
    )
    .filter((ranking) => ranking.length > 0);
  return fuseReciprocalRankFusion(rankings, request.limit).flatMap((key) => {
    const row = rowsByKey.get(key);
    return row === undefined ? [] : [row];
  });
}

/** 用于批量读取根到父级且最多八项的公开祖先标题链。 */
export async function readSearchAncestors(
  database: Kysely<DatabaseSchema>,
  ownerId: string,
  documentIds: readonly string[],
): Promise<readonly SearchAncestorRow[]> {
  if (documentIds.length === 0) return [];
  const sql = await loadSql();
  const ids = sql.join(documentIds.map((id) => sql`${id}::uuid`));
  const result = await sql<SearchAncestorRow>`
    WITH ancestor_rows AS (
      SELECT child.id AS document_id, ancestor.id, ancestor.title, path_id.ordinality AS ordinal,
        count(*) OVER (PARTITION BY child.id) AS total
      FROM documents child
      CROSS JOIN LATERAL unnest(string_to_array(trim(BOTH '/' FROM child.path), '/'))
        WITH ORDINALITY AS path_id(id, ordinality)
      JOIN documents ancestor ON ancestor.id = path_id.id::uuid
        AND ancestor.owner_id = child.owner_id
        AND ancestor.knowledge_base_id = child.knowledge_base_id
      WHERE child.owner_id = ${ownerId}::uuid AND child.id IN (${ids})
        AND ancestor.id <> child.id AND ancestor.deleted_at IS NULL
    )
    SELECT document_id, id, title, ordinal::text, total::text FROM ancestor_rows
    WHERE total <= 8 OR ordinal = 1 OR ordinal > total - 7
    ORDER BY document_id, ordinal
  `.execute(database);
  return result.rows;
}

/** 用于按当前范围检查正文投影缺失或版本落后状态。 */
export async function hasUpdatingProjection(
  database: Kysely<DatabaseSchema>,
  ownerId: string,
  query: NormalizedSearchQuery,
): Promise<boolean> {
  if (query.field === 'title') return false;
  const sql = await loadSql();
  const filters = documentFilters(sql, query);
  const result = await sql<{ updating: boolean }>`SELECT EXISTS (
    SELECT 1 FROM documents d
    JOIN knowledge_bases kb ON kb.id = d.knowledge_base_id AND kb.owner_id = d.owner_id
    LEFT JOIN search_document_projections projection
      ON projection.document_id = d.id AND projection.owner_id = d.owner_id
    WHERE d.owner_id = ${ownerId}::uuid AND d.deleted_at IS NULL AND kb.deleted_at IS NULL
      ${filters.knowledgeBase} ${filters.tagFilter} ${filters.updatedAfter}
      AND (projection.document_id IS NULL OR projection.indexed_document_version <> d.version)
  ) AS updating`.execute(database);
  return result.rows[0]?.updating === true;
}
