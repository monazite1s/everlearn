/** @fileoverview 定义 Search 查询层内部使用且不会直接序列化的 PostgreSQL 行投影。 */

export interface RankedSearchRow {
  readonly block_id: string | null;
  readonly document_id: string;
  readonly document_title: string;
  readonly document_version: number;
  readonly heading_path: string[] | null;
  readonly knowledge_base_id: string;
  readonly knowledge_base_name: string;
  readonly matched_field: 'both' | 'content' | 'title';
  readonly rank_score: string;
  readonly rank_tier: number;
  readonly text: string | null;
  readonly updated_at: string;
  readonly updated_at_micros: string;
}

export interface SearchAncestorRow {
  readonly document_id: string;
  readonly id: string;
  readonly ordinal: string;
  readonly title: string;
  readonly total: string;
}
