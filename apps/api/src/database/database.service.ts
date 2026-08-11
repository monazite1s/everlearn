/** @fileoverview Owns the API PostgreSQL client and its bounded connection pool lifecycle. */

import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect, type KyselyConfig } from 'kysely';
import { Pool } from 'pg';

const databaseLogger = new Logger('DatabasePool');
const MAX_POOL_CONNECTIONS = 10;
const CONNECTION_TIMEOUT_MILLISECONDS = 5_000;
const IDLE_TIMEOUT_MILLISECONDS = 30_000;

export type DatabaseSchema = Record<never, never>;

/** Reports unexpected idle-client failures without exposing connection details. */
function reportIdleClientError(error: Error): void {
  databaseLogger.error('Unexpected idle PostgreSQL client error', error.stack);
}

/** Builds the shared PostgreSQL dialect configuration with conservative pool limits. */
function createDatabaseConfig(connectionString: string): KyselyConfig {
  const pool = new Pool({
    connectionString,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MILLISECONDS,
    idleTimeoutMillis: IDLE_TIMEOUT_MILLISECONDS,
    max: MAX_POOL_CONNECTIONS,
  });
  pool.on('error', reportIdleClientError);
  return { dialect: new PostgresDialect({ pool }) };
}

/** Creates a standalone database client for migration and maintenance processes. */
export function createDatabaseClient(connectionString: string): Kysely<DatabaseSchema> {
  return new Kysely<DatabaseSchema>(createDatabaseConfig(connectionString));
}

/** Provides one injectable database client and releases its pool during Nest shutdown. */
@Injectable()
export class DatabaseService extends Kysely<DatabaseSchema> implements OnModuleDestroy {
  constructor(configService: ConfigService) {
    super(createDatabaseConfig(configService.getOrThrow<string>('DATABASE_URL')));
  }

  /** Waits for checked-out clients before closing the API connection pool. */
  async onModuleDestroy(): Promise<void> {
    await this.destroy();
  }
}
