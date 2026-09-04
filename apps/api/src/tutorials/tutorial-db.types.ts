/**
 * @fileoverview 资讯状态表并入 kysely-codegen 生成的共享 schema 后的教程兼容别名。
 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import type { DatabaseSchema } from '../database/database.types';

/** 教程状态表并入生成 schema 后的等价类型别名。 */
export type TutorialDatabaseSchema = DatabaseSchema;

/** 用于把共享客户端直接作为包含教程状态表的视图返回。 */
export function withTutorialTables(
  database: Kysely<DatabaseSchema>,
): Kysely<TutorialDatabaseSchema> {
  return database;
}
