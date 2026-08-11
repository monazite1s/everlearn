/** @fileoverview Runs API database migrations as an explicit build-time command. */

import { Logger } from '@nestjs/common';

import { createDatabaseClient } from './database.service';
import { runMigrations } from './migration-runner';
import type { MigrationDirection } from './migration-runner';

const migrationLogger = new Logger('DatabaseMigration');

/** Accepts only the two supported migration directions. */
function parseDirection(value: string | undefined): MigrationDirection {
  if (value === 'up' || value === 'down') return value;
  throw new Error('Migration direction must be "up" or "down"');
}

/** Reads and validates the only runtime setting required by the migration process. */
function readDatabaseUrl(environment: NodeJS.ProcessEnv): string {
  const value = environment.DATABASE_URL;
  if (value === undefined || value.trim() === '') throw new Error('DATABASE_URL is required');
  const protocol = new URL(value).protocol;
  if (protocol !== 'postgres:' && protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use postgres or postgresql');
  }
  return value;
}

/** Logs a migration failure without printing credentials or connection strings. */
function reportMigrationFailure(error: unknown): void {
  const trace = error instanceof Error ? error.stack : undefined;
  migrationLogger.error('Database migration failed', trace);
}

/** Creates one standalone client, executes the requested migration, and always releases it. */
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
