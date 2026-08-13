/**
 * @fileoverview Boots the versioned NestJS HTTP API without domain dependencies.
 */

import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

const bootstrapLogger = new Logger('ApiBootstrap');
const systemLogger = new ConsoleLogger({ colors: false, json: true });

const DEFAULT_PORT = 3001;
const DEFAULT_HOST = '127.0.0.1';

/** Resolves the listen port from an optional validated environment value. */
function resolvePort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${value}`);
  }
  return port;
}

/** Starts the API and reports startup failures through the framework logger. */
async function bootstrap(): Promise<void> {
  try {
    const app = await NestFactory.create(AppModule, { logger: systemLogger });
    app.setGlobalPrefix('api/v1');
    await app.listen(resolvePort(process.env.PORT), process.env.HOST ?? DEFAULT_HOST);
  } catch (error: unknown) {
    const trace = error instanceof Error ? error.stack : undefined;
    bootstrapLogger.error('API startup failed', trace);
    process.exitCode = 1;
  }
}

void bootstrap();
