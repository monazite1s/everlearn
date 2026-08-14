/** @fileoverview 通过显式命令运行 API 数据库迁移。 */

import { Logger } from '@nestjs/common';

import { createDatabaseClient } from './database.service';
import { runMigrations } from './migration-runner';
import type { MigrationDirection } from './migration-runner';

const migrationLogger = new Logger('DatabaseMigration');

/** 用于限定受支持的迁移方向。 */
function parseDirection(value: string | undefined): MigrationDirection {
  if (value === 'up' || value === 'down') return value;
  throw new Error('Migration direction must be "up" or "down"');
}

/** 用于读取并校验迁移进程所需的数据库配置。 */
function readDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  const value = environment.DATABASE_URL;
  if (value === undefined || value.trim() === '') throw new Error('DATABASE_URL is required');
  const protocol = new URL(value).protocol;
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use postgres or postgresql');
  }
  return value;
}

/** 用于记录迁移失败且不输出凭据或连接串。 */
function reportMigrationFailure(error: unknown): void {
  const trace = error instanceof Error ? error.stack : undefined;
  migrationLogger.error('Database migration failed', trace);
}

/** 用于创建独立客户端、执行迁移并确保释放连接。 */
async function main(): Promise<void> {
  try {
    const database = await createDatabaseClient(readDatabaseUrl(process.env));
    try {
      const summary = await runMigrations(database, { direction: parseDirection(process.argv[2]) });
      migrationLogger.log(JSON.stringify(summary));
    } finally {
      await database.destroy();
    }
  } catch (error: unknown) {
    reportMigrationFailure(error);
    process.exitCode = 1;
  }
}

void main();
