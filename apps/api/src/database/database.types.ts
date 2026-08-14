/** @fileoverview 定义 Kysely 类型查询共享的 PostgreSQL 行契约。 */

import type { ColumnType } from 'kysely' with { 'resolution-mode': 'import' };

type CreatedTimestamp = ColumnType<Date, Date | string | undefined, never>;
type Defaulted<T> = ColumnType<T, T | undefined, T>;
type UpdatedTimestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type BigIntValue = ColumnType<string, number | string, number | string>;

export type JsonValue =
  boolean | null | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface UserTable {
  id: string;
  display_name: string;
  timezone: string;
  created_at: CreatedTimestamp;
}

export interface KnowledgeBaseTable {
  id: string;
  owner_id: string;
  name: string;
  description: Defaulted<string>;
  kind: 'news' | 'normal' | 'tutorial';
  version: Defaulted<number>;
  deleted_at: Date | null;
  created_at: CreatedTimestamp;
  updated_at: UpdatedTimestamp;
}

export interface DocumentTable {
  id: string;
  owner_id: string;
  knowledge_base_id: string;
  parent_id: string | null;
  path: string;
  position: BigIntValue;
  title: string;
  content_json: Defaulted<JsonValue>;
  schema_version: Defaulted<number>;
  plain_text: Defaulted<string>;
  version: Defaulted<number>;
  deleted_at: Date | null;
  deleted_parent_id: string | null;
  deleted_position: BigIntValue | null;
  created_at: CreatedTimestamp;
  updated_at: UpdatedTimestamp;
}

export interface DocumentRevisionTable {
  id: string;
  owner_id: string;
  document_id: string;
  revision_number: number;
  source: 'ai' | 'automation' | 'import' | 'manual' | 'restore';
  content_json: JsonValue;
  schema_version: number;
  plain_text: string;
  created_by: string;
  generation_id: string | null;
  workflow_run_id: string | null;
  created_at: CreatedTimestamp;
}

export interface InboxItemTable {
  id: string;
  owner_id: string;
  kind: 'text' | 'url';
  content: string;
  status: 'converted' | 'pending';
  converted_document_id: string | null;
  deleted_at: Date | null;
  created_at: CreatedTimestamp;
  updated_at: UpdatedTimestamp;
}

export interface IdempotencyRecordTable {
  id: string;
  owner_id: string;
  operation: string;
  idempotency_key: string;
  request_hash: string;
  response_json: JsonValue;
  created_at: CreatedTimestamp;
}

export interface DatabaseSchema {
  users: UserTable;
  knowledge_bases: KnowledgeBaseTable;
  documents: DocumentTable;
  document_revisions: DocumentRevisionTable;
  inbox_items: InboxItemTable;
  idempotency_records: IdempotencyRecordTable;
}
