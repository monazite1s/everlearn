/**
 * @fileoverview Verifies the standalone NestJS lifecycle used by background workers.
 */

import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

/** Provides the root dependency-injection context before queue modules are introduced. */
@Module({})
class WorkerModule {}

const bootstrapLogger = new Logger('WorkerBootstrap');

/** Starts and closes the worker context so the foundation has no idle fake consumer. */
async function bootstrap(): Promise<void> {
  try {
    const app = await NestFactory.createApplicationContext(WorkerModule);
    bootstrapLogger.log('Worker lifecycle is ready');
    await app.close();
  } catch (error: unknown) {
    const trace = error instanceof Error ? error.stack : undefined;
    bootstrapLogger.error('Worker startup failed', trace);
    process.exitCode = 1;
  }
}

void bootstrap();
