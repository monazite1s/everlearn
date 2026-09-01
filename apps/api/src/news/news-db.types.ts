/**
 * @fileoverview 资讯状态表已并入 kysely-codegen 生成的共享 schema，此处仅保留兼容视图别名。
 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database/database.types';

/** 资讯状态表并入生成 schema 后的等价类型别名。 */
export type NewsDatabaseSchema = DatabaseSchema;

/** 用于把共享客户端直接作为包含资讯状态表的视图返回。 */
export function withNewsTables(database: Kysely<DatabaseSchema>): Kysely<NewsDatabaseSchema> {
  return database;
}
