/**
 * @fileoverview 补充 Workflow 状态表的 Kysely 类型并放宽客户端 schema 视图。
 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import type { DatabaseSchema, Generated, Json, Timestamp } from '../database/database.types';

/** workflows 表行形态。 */
export interface WorkflowTable {
  created_at: Generated<Timestamp>;
  draft_definition: Json;
  id: string;
  name: string;
  owner_id: string;
  published_version_id: string | null;
  schedule: Json | null;
  updated_at: Generated<Timestamp>;
}

/** workflow_versions 表行形态，发布后不可变。 */
export interface WorkflowVersionTable {
  created_at: Generated<Timestamp>;
  definition: Json;
  id: string;
  version: number;
  workflow_id: string;
}

/** workflow_runs 表行形态。 */
export interface WorkflowRunTable {
  created_at: Generated<Timestamp>;
  error_code: string | null;
  id: string;
  output_summary: string | null;
  owner_id: string;
  status: 'canceled' | 'failed' | 'pending' | 'running' | 'succeeded';
  updated_at: Generated<Timestamp>;
  version_id: string;
  workflow_id: string;
}

/** workflow_run_events 表行形态。 */
export interface WorkflowRunEventTable {
  created_at: Generated<Timestamp>;
  id: string;
  message: string | null;
  node_id: string;
  run_id: string;
  seq: number;
  status: 'failed' | 'running' | 'succeeded';
}

/** ponytail: database.types.ts 由 kysely-codegen 生成，本轮以本地扩展避免与并行走查竞态；下次 db:typegen 后应并入生成文件并删除本接口。 */
export interface WorkflowDatabaseSchema extends DatabaseSchema {
  workflow_run_events: WorkflowRunEventTable;
  workflow_runs: WorkflowRunTable;
  workflow_versions: WorkflowVersionTable;
  workflows: WorkflowTable;
}

/** 用于把共享客户端放宽为包含 Workflow 状态表的视图。 */
export function withWorkflowTables(
  database: Kysely<DatabaseSchema>,
): Kysely<WorkflowDatabaseSchema> {
  return database as unknown as Kysely<WorkflowDatabaseSchema>;
}
