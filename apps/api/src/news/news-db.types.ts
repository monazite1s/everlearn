/**
 * @fileoverview 补充资讯状态表的 Kysely 类型并放宽客户端 schema 视图。
 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import type { DatabaseSchema, Generated, Json, Timestamp } from '../database/database.types';

/** news_subscriptions 表行形态。 */
export interface NewsSubscriptionTable {
  created_at: Generated<Timestamp>;
  exclude_keywords: string[];
  feed_url: string;
  id: string;
  include_keywords: string[];
  name: string;
  news_knowledge_base_id: string;
  owner_id: string;
  schedule: Json | null;
  updated_at: Generated<Timestamp>;
}

/** news_seen_items 表行形态。 */
export interface NewsSeenItemTable {
  content_hash: string;
  normalized_url: string;
  seen_at: Generated<Timestamp>;
  subscription_id: string;
}

/** news_digest_runs 表行形态。 */
export interface NewsDigestRunTable {
  brief_document_id: string | null;
  created_at: Generated<Timestamp>;
  error_code: string | null;
  id: string;
  owner_id: string;
  status: 'failed' | 'pending' | 'running' | 'succeeded';
  subscription_id: string;
  updated_at: Generated<Timestamp>;
}

/** ponytail: database.types.ts 由 kysely-codegen 生成，本轮以本地扩展避免与并行走查竞态；下次 db:typegen 后应并入生成文件并删除本接口。 */
export interface NewsDatabaseSchema extends DatabaseSchema {
  news_digest_runs: NewsDigestRunTable;
  news_seen_items: NewsSeenItemTable;
  news_subscriptions: NewsSubscriptionTable;
}

/** 用于把共享客户端放宽为包含资讯状态表的视图。 */
export function withNewsTables(database: Kysely<DatabaseSchema>): Kysely<NewsDatabaseSchema> {
  return database as unknown as Kysely<NewsDatabaseSchema>;
}
