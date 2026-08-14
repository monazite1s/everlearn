/** @fileoverview 管理 API PostgreSQL 客户端及其连接池生命周期。 */

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
import { Pool } from 'pg';

import type { DatabaseSchema } from './database.types';

export type { DatabaseSchema } from './database.types';

const databaseLogger = new Logger('DatabasePool');
const MAX_POOL_CONNECTIONS = 10;
const CONNECTION_TIMEOUT_MILLISECONDS = 5_000;
const IDLE_TIMEOUT_MILLISECONDS = 30_000;

/** 用于报告空闲客户端异常且不暴露连接细节。 */
function reportIdleClientError(error: Error): void {
  databaseLogger.error('Unexpected idle PostgreSQL client error', error.stack);
}

/** 用于通过 Kysely 的 ESM 边界创建独立数据库客户端。 */
export async function createDatabaseClient(
  connectionString: string,
): Promise<Kysely<DatabaseSchema>> {
  const { Kysely: KyselyClient, PostgresDialect } = await import('kysely');
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MILLISECONDS,
    idleTimeoutMillis: IDLE_TIMEOUT_MILLISECONDS,
    max: MAX_POOL_CONNECTIONS,
  });
  pool.on('error', reportIdleClientError);
  return new KyselyClient<DatabaseSchema>({ dialect: new PostgresDialect({ pool }) });
}

/** 用于提供可注入数据库客户端并在 Nest 关闭时释放连接池。 */
@Injectable()
export class DatabaseService implements OnModuleDestroy, OnModuleInit {
  private database: Kysely<DatabaseSchema> | undefined;

  /** 用于根据已校验服务端连接串初始化 API 客户端。 */
  constructor(private readonly configService: ConfigService) {}

  /** 用于提供已初始化客户端并拒绝启动完成前访问。 */
  get client(): Kysely<DatabaseSchema> {
    if (this.database === undefined) throw new Error('Database client is not initialized');
    return this.database;
  }

  /** 用于在控制器接收请求前加载 Kysely ESM 边界。 */
  async onModuleInit(): Promise<void> {
    this.database = await createDatabaseClient(
      this.configService.getOrThrow<string>('DATABASE_URL'),
    );
  }

  /** 用于等待借出连接归还后关闭 API 连接池。 */
  async onModuleDestroy(): Promise<void> {
    await this.database?.destroy();
  }
}
