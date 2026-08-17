/**
 * @fileoverview 建立后台 Worker 生命周期并挂载每日清理调度。
 */

import { ConsoleLogger, Logger, Module } from '@nestjs/common';
import type { INestApplicationContext } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { validateRuntimeEnvironment } from './config/runtime-config';
import { createWorkerLogEntry } from './logging/worker-log-context';
import { startAttachmentOrphanPurgeRuntime } from './purge/attachment-orphan-purge.runtime';
import type {
  AttachmentOrphanPurgeRuntime,
  AttachmentOrphanPurgeRuntimeConfig,
} from './purge/attachment-orphan-purge.runtime';
import { startTrashPurgeRuntime } from './purge/trash-purge.runtime';
import type { TrashPurgeRuntime, TrashPurgeRuntimeConfig } from './purge/trash-purge.runtime';

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

/** 用于从进程配置解析清理运行时所需字段。 */
function readPurgeConfig(
  config: ConfigService<Record<string, string>, false>,
): TrashPurgeRuntimeConfig {
  return {
    apiInternalUrl: config.get('API_INTERNAL_URL', 'http://127.0.0.1:3001'),
    cron: config.get('PURGE_CRON', '0 3 * * *'),
    redisUrl: config.get('REDIS_URL', ''),
    secret: config.get('PURGE_TRIGGER_SECRET', ''),
    timezone: config.get('PURGE_TIMEZONE', 'UTC'),
  };
}

/** 用于以单行 JSON 记录清理结果统计（扩展字段属运维结果，非任务载荷）。 */
function logPurgeOutcome(event: string, fields: Record<string, number | string>): void {
  bootstrapLogger.log(JSON.stringify({ event, service: 'worker', ...fields }));
}

/** 用于启动每日清理调度并注册完成与失败的结构化日志。 */
async function startPurge(app: INestApplicationContext): Promise<TrashPurgeRuntime> {
  const config = readPurgeConfig(app.get(ConfigService<Record<string, string>, false>));
  return startTrashPurgeRuntime(config, {
    onCompleted:
      /** 用于记录一次成功清理的统计。 */
      (stats) => logPurgeOutcome('trash.purge.completed', { ...stats }),
    onFailed:
      /** 用于记录一次失败尝试的原因与次数。 */
      (error, attemptsMade) =>
        logPurgeOutcome('trash.purge.failed', { attemptsMade, reason: error.message }),
  });
}

/** 用于从进程配置解析附件孤儿清理运行时所需字段。 */
function readAttachmentPurgeConfig(
  config: ConfigService<Record<string, string>, false>,
): AttachmentOrphanPurgeRuntimeConfig {
  return {
    apiInternalUrl: config.get('API_INTERNAL_URL', 'http://127.0.0.1:3001'),
    cron: config.get('ATTACHMENT_PURGE_CRON', '0 4 * * *'),
    redisUrl: config.get('REDIS_URL', ''),
    secret: config.get('PURGE_TRIGGER_SECRET', ''),
    timezone: config.get('ATTACHMENT_PURGE_TIMEZONE', 'UTC'),
  };
}

/** 用于启动每日附件孤儿清理调度并注册结构化日志。 */
async function startAttachmentPurge(
  app: INestApplicationContext,
): Promise<AttachmentOrphanPurgeRuntime> {
  const config = readAttachmentPurgeConfig(app.get(ConfigService<Record<string, string>, false>));
  return startAttachmentOrphanPurgeRuntime(config, {
    onCompleted:
      /** 用于记录一次成功附件清理的统计。 */
      (stats) => logPurgeOutcome('attachment.purge.completed', { ...stats }),
    onFailed:
      /** 用于记录一次失败附件清理的原因与次数。 */
      (error, attemptsMade) =>
        logPurgeOutcome('attachment.purge.failed', { attemptsMade, reason: error.message }),
  });
}

/** 用于在终止信号到达前保持 Worker 存活。 */
function waitForShutdownSignal(): Promise<void> {
  return new Promise((resolve) => {
    process.once('SIGINT', () => resolve());
    process.once('SIGTERM', () => resolve());
  });
}

/** 用于启动 Worker 上下文与清理调度，收到终止信号后按序关闭。 */
async function bootstrap(): Promise<void> {
  let purge: TrashPurgeRuntime | undefined;
  let attachmentPurge: AttachmentOrphanPurgeRuntime | undefined;
  try {
    const app = await NestFactory.createApplicationContext(WorkerModule, { logger: systemLogger });
    purge = await startPurge(app);
    attachmentPurge = await startAttachmentPurge(app);
    bootstrapLogger.log(createWorkerLogEntry({ event: 'worker.lifecycle.ready' }));
    await waitForShutdownSignal();
    await attachmentPurge.close();
    await purge.close();
    await app.close();
  } catch (error: unknown) {
    const trace = error instanceof Error ? error.stack : undefined;
    bootstrapLogger.error('Worker startup failed', trace);
    await attachmentPurge?.close();
    await purge?.close();
    process.exitCode = 1;
  }
}

void bootstrap();
