/**
 * @fileoverview Boots the versioned NestJS HTTP API without domain dependencies.
 */

import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

const bootstrapLogger = new Logger('ApiBootstrap');
const systemLogger = new ConsoleLogger({ colors: false, json: true });

/** Starts the API and reports startup failures through the framework logger. */
async function bootstrap(): Promise<void> {
  try {
    const app = await NestFactory.create(AppModule, { logger: systemLogger });
    app.setGlobalPrefix('api/v1');
    await app.listen(3001, '127.0.0.1');
  } catch (error: unknown) {
    const trace = error instanceof Error ? error.stack : undefined;
    bootstrapLogger.error('API startup failed', trace);
    process.exitCode = 1;
  }
}

void bootstrap();
