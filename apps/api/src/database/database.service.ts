/** @fileoverview Owns the API PostgreSQL client and its bounded connection pool lifecycle. */

import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };
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

/** Creates a standalone database client using the ESM-only Kysely boundary. */
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

/** Provides one injectable database client and releases its pool during Nest shutdown. */
@Injectable()
export class DatabaseService implements OnModuleDestroy, OnModuleInit {
  private database: Kysely<DatabaseSchema> | undefined;

  /** Initializes the API client from the validated server-only connection string. */
  constructor(private readonly configService: ConfigService) {}

  /** Exposes the initialized client while rejecting access before Nest startup completes. */
  get client(): Kysely<DatabaseSchema> {
    if (this.database === undefined) throw new Error('Database client is not initialized');
    return this.database;
  }

  /** Loads Kysely through its ESM boundary before controllers accept requests. */
  async onModuleInit(): Promise<void> {
    this.database = await createDatabaseClient(
      this.configService.getOrThrow<string>('DATABASE_URL'),
    );
  }

  /** Waits for checked-out clients before closing the API connection pool. */
  async onModuleDestroy(): Promise<void> {
    await this.database?.destroy();
  }
}
