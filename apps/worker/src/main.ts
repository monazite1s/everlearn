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
import { startSearchProjectionRuntime } from './search/search-projection.runtime';
import { startSearchEmbeddingRuntime } from './search/search-embedding.runtime';
import { startNewsRuntime } from './news/news-run.runtime';
import type { NewsRuntime, NewsRuntimeConfig } from './news/news-run.runtime';
import { startWorkflowRuntime } from './workflows/workflow-run.runtime';
import { startTutorialRuntime } from './tutorials/tutorial-run.runtime';
import type { TutorialRuntime } from './tutorials/tutorial-run.runtime';
import { resolveTutorialWebSearch } from './tutorials/tutorial-research';
import type { WorkflowRuntime } from './workflows/workflow-run.runtime';
import type {
  SearchProjectionRuntime,
  SearchProjectionRuntimeConfig,
} from './search/search-projection.runtime';
import type {
  SearchEmbeddingRuntime,
  SearchEmbeddingRuntimeConfig,
} from './search/search-embedding.runtime';
import type { WorkflowRuntimeConfig } from './workflows/workflow-run.runtime';

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

/** 用于从既有内部 API 与 Redis 配置生成搜索投影运行时配置。 */
/** 用于从进程配置解析 Workflow 运行时所需字段。 */
function readWorkflowConfig(
  config: ConfigService<Record<string, string>, false>,
): WorkflowRuntimeConfig {
  return {
    apiInternalUrl: config.get('API_INTERNAL_URL', 'http://127.0.0.1:3001'),
    redisUrl: config.get('REDIS_URL', ''),
    secret: config.get('PURGE_TRIGGER_SECRET', ''),
  };
}

/** 用于启动 Workflow 运行队列与计划同步。 */
async function startWorkflows(app: INestApplicationContext): Promise<WorkflowRuntime> {
  return startWorkflowRuntime(
    readWorkflowConfig(app.get(ConfigService<Record<string, string>, false>)),
  );
}

/** 用于从既有内部 API 与 Redis 配置生成资讯运行时配置。 */
function readNewsConfig(config: ConfigService<Record<string, string>, false>): NewsRuntimeConfig {
  return {
    apiInternalUrl: config.get('API_INTERNAL_URL', 'http://127.0.0.1:3001'),
    redisUrl: config.get('REDIS_URL', ''),
    secret: config.get('PURGE_TRIGGER_SECRET', ''),
  };
}

/** 用于启动资讯简报队列与计划同步。 */
async function startNews(app: INestApplicationContext): Promise<NewsRuntime> {
  return startNewsRuntime(readNewsConfig(app.get(ConfigService<Record<string, string>, false>)));
}

/** 用于按名读取 Worker 环境配置。 */
function readWorkerEnv(
  config: ConfigService<Record<string, string>, false>,
  name: string,
): string | undefined {
  return config.get<string>(name);
}

/** 用于从既有内部 API 与 Redis 配置启动教程队列运行时。 */
async function startTutorials(app: INestApplicationContext): Promise<TutorialRuntime> {
  const config = app.get(ConfigService<Record<string, string>, false>);
  return startTutorialRuntime(
    {
      apiInternalUrl: config.get('API_INTERNAL_URL', 'http://127.0.0.1:3001'),
      redisUrl: config.get('REDIS_URL', ''),
      secret: config.get('PURGE_TRIGGER_SECRET', ''),
    },
    resolveTutorialWebSearch({ get: readWorkerEnv.bind(null, config) }),
  );
}

/** 用于从配置读取搜索投影队列连接参数。 */
function readSearchProjectionConfig(
  config: ConfigService<Record<string, string>, false>,
): SearchProjectionRuntimeConfig {
  return {
    apiInternalUrl: config.get('API_INTERNAL_URL', 'http://127.0.0.1:3001'),
    intervalMs: 60_000,
    redisUrl: config.get('REDIS_URL', ''),
    secret: config.get('PURGE_TRIGGER_SECRET', ''),
  };
}

/** 用于启动搜索投影恢复调度并注册结构化运行结果日志。 */
async function startSearchProjection(
  app: INestApplicationContext,
): Promise<SearchProjectionRuntime> {
  const config = readSearchProjectionConfig(app.get(ConfigService<Record<string, string>, false>));
  return startSearchProjectionRuntime(config, {
    onCompleted:
      /** 用于记录一次成功事件排空与补偿扫描的统计。 */
      (stats) => logPurgeOutcome('search.projection.completed', { ...stats }),
    onFailed:
      /** 用于记录一次触发失败的原因与队列尝试次数。 */
      (error, attemptsMade) =>
        logPurgeOutcome('search.projection.failed', { attemptsMade, reason: error.message }),
  });
}

/** 用于从配置读取搜索向量回填队列连接参数。 */
function readSearchEmbeddingConfig(
  config: ConfigService<Record<string, string>, false>,
): SearchEmbeddingRuntimeConfig {
  return {
    apiInternalUrl: config.get('API_INTERNAL_URL', 'http://127.0.0.1:3001'),
    intervalMs: 60_000,
    redisUrl: config.get('REDIS_URL', ''),
    secret: config.get('PURGE_TRIGGER_SECRET', ''),
  };
}

/** 用于启动搜索向量回填调度并注册结构化运行结果日志。 */
async function startSearchEmbedding(app: INestApplicationContext): Promise<SearchEmbeddingRuntime> {
  const config = readSearchEmbeddingConfig(app.get(ConfigService<Record<string, string>, false>));
  return startSearchEmbeddingRuntime(config, {
    onCompleted:
      /** 用于记录一次回填批次的更新统计。 */
      (stats) =>
        logPurgeOutcome('search.embedding.completed', { ...stats, skipped: stats.skipped ? 1 : 0 }),
    onFailed:
      /** 用于记录一次回填触发失败的原因与队列尝试次数。 */
      (error, attemptsMade) =>
        logPurgeOutcome('search.embedding.failed', { attemptsMade, reason: error.message }),
  });
}

/** 用于在终止信号到达前保持 Worker 存活。 */
function waitForShutdownSignal(): Promise<void> {
  return new Promise((resolve) => {
    process.once('SIGINT', () => resolve());
    process.once('SIGTERM', () => resolve());
  });
}

/** 用于按启动逆序关闭已启动运行时并忽略未初始化项。 */
async function closeRuntimes(runtimes: readonly { close: () => Promise<void> }[]): Promise<void> {
  for (const runtime of [...runtimes].reverse()) await runtime.close();
}

/** 用于启动 Worker 上下文与全部周期运行时，收到终止信号后按启动逆序关闭。 */
async function bootstrap(): Promise<void> {
  const runtimes: { close: () => Promise<void> }[] = [];
  try {
    const app = await NestFactory.createApplicationContext(WorkerModule, { logger: systemLogger });
    runtimes.push(
      await startPurge(app),
      await startAttachmentPurge(app),
      await startSearchProjection(app),
      await startSearchEmbedding(app),
      await startWorkflows(app),
      await startNews(app),
      await startTutorials(app),
    );
    bootstrapLogger.log(createWorkerLogEntry({ event: 'worker.lifecycle.ready' }));
    await waitForShutdownSignal();
    await closeRuntimes(runtimes);
    await app.close();
  } catch (error: unknown) {
    const trace = error instanceof Error ? error.stack : undefined;
    bootstrapLogger.error('Worker startup failed', trace);
    await closeRuntimes(runtimes);
    process.exitCode = 1;
  }
}

void bootstrap();
