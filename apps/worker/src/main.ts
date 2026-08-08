/**
 * @fileoverview Verifies the standalone NestJS lifecycle used by background workers.
 */

import { ConsoleLogger, Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { validateRuntimeEnvironment } from './runtime-config';
import { createWorkerLogEntry } from './worker-log-context';

/** Provides the root dependency-injection context before queue modules are introduced. */
@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateRuntimeEnvironment,
    }),
  ],
})
class WorkerModule {}

const bootstrapLogger = new Logger('WorkerBootstrap');
const systemLogger = new ConsoleLogger({ colors: false, json: true });

/** Starts and closes the worker context so the foundation has no idle fake consumer. */
async function bootstrap(): Promise<void> {
  try {
    const app = await NestFactory.createApplicationContext(WorkerModule, { logger: systemLogger });
    bootstrapLogger.log(createWorkerLogEntry({ event: 'worker.lifecycle.ready' }));
    await app.close();
  } catch (error: unknown) {
    const trace = error instanceof Error ? error.stack : undefined;
    bootstrapLogger.error('Worker startup failed', trace);
    process.exitCode = 1;
  }
}

void bootstrap();
