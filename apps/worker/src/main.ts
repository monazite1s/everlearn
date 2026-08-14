/**
 * @fileoverview 建立后台 Worker 使用的独立 NestJS 生命周期。
 */

import { ConsoleLogger, Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { validateRuntimeEnvironment } from './config/runtime-config';
import { createWorkerLogEntry } from './logging/worker-log-context';

/** 用于提供队列模块接入前的根依赖注入上下文。 */
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

/** 用于启动并关闭 Worker 上下文，不创建占位消费者。 */
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
