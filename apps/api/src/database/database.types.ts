/** @fileoverview 此文件由 kysely-codegen 从真实 PostgreSQL Schema 生成，禁止手工编辑。 */

import type { ColumnType } from 'kysely' with { 'resolution-mode': 'import' };

export type Generated<T> =
  T extends ColumnType<infer S, infer I, infer U>
    ? ColumnType<S, I | undefined, U>
    : ColumnType<T, T | undefined, T>;

export type Int8 = ColumnType<string, bigint | number | string, bigint | number | string>;

export type Json = JsonValue;

export type JsonArray = JsonValue[];

export interface JsonObject {
  [x: string]: JsonValue | undefined;
}

export type JsonPrimitive = boolean | number | string | null;

export type JsonValue = JsonArray | JsonObject | JsonPrimitive;

export type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface AttachmentTable {
  created_at: Generated<Timestamp>;
  file_name: string;
  id: string;
  kind: 'file' | 'image';
  mime_type: string;
  object_key: string;
  owner_id: string;
  reference_count: Generated<number>;
  sha256: string | null;
  size_bytes: Int8;
  status: 'active' | 'pending';
  updated_at: Generated<Timestamp>;
}

export interface DocumentRevisionTable {
  content_json: Json;
  created_at: Generated<Timestamp>;
  created_by: string;
  document_id: string;
  generation_id: string | null;
  id: string;
  owner_id: string;
  plain_text: string;
  revision_number: number;
  schema_version: number;
  source: 'ai' | 'automation' | 'import' | 'manual' | 'restore';
  title: string;
  workflow_run_id: string | null;
}

export interface DocumentTable {
  content_json: Generated<Json>;
  created_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
  deleted_parent_id: string | null;
  deleted_position: Int8 | null;
  id: string;
  knowledge_base_id: string;
  owner_id: string;
  parent_id: string | null;
  path: string;
  plain_text: Generated<string>;
  position: Int8;
  schema_version: Generated<number>;
  title: string;
  updated_at: Generated<Timestamp>;
  version: Generated<number>;
}

export interface IdempotencyRecordTable {
  created_at: Generated<Timestamp>;
  id: string;
  idempotency_key: string;
  operation: string;
  owner_id: string;
  request_hash: string;
  response_json: Json;
}

export interface InboxItemTable {
  content: string;
  converted_document_id: string | null;
  created_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
  id: string;
  kind: 'text' | 'url';
  owner_id: string;
  status: 'converted' | 'pending';
  updated_at: Generated<Timestamp>;
}

export interface KnowledgeBaseTable {
  created_at: Generated<Timestamp>;
  deleted_at: Timestamp | null;
  description: Generated<string>;
  id: string;
  kind: 'news' | 'normal' | 'tutorial';
  name: string;
  owner_id: string;
  updated_at: Generated<Timestamp>;
  version: Generated<number>;
}

export interface OutboxEventTable {
  aggregate_id: string;
  aggregate_version: number;
  attempt_count: Generated<number>;
  available_at: Generated<Timestamp>;
  event_type: 'document.deleted' | 'document.restored' | 'document.saved';
  failed_at: Timestamp | null;
  id: string;
  last_error_code: string | null;
  occurred_at: Generated<Timestamp>;
  owner_id: string;
  payload: Json;
  processed_at: Timestamp | null;
  schema_version: number;
}

export interface SearchBlockTable {
  block_id: string;
  block_order: number;
  content_hash: string;
  created_at: Generated<Timestamp>;
  document_id: string;
  document_version: number;
  heading_path: Generated<string[]>;
  id: string;
  owner_id: string;
  search_vector: Generated<string | null>;
  text: string;
  updated_at: Generated<Timestamp>;
}

export interface SearchDocumentProjectionTable {
  document_id: string;
  indexed_at: Generated<Timestamp>;
  indexed_content_hash: string;
  indexed_document_version: number;
  owner_id: string;
}

export interface UserTable {
  created_at: Generated<Timestamp>;
  display_name: string;
  id: string;
  timezone: string;
}

export interface DB {
  attachments: AttachmentTable;
  document_revisions: DocumentRevisionTable;
  documents: DocumentTable;
  idempotency_records: IdempotencyRecordTable;
  inbox_items: InboxItemTable;
  knowledge_bases: KnowledgeBaseTable;
  outbox_events: OutboxEventTable;
  search_blocks: SearchBlockTable;
  search_document_projections: SearchDocumentProjectionTable;
  users: UserTable;
}

export type DatabaseSchema = DB;
