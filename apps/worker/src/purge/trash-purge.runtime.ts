/** @fileoverview 注册每日清理的幂等调度并处理带退避的清理作业。 */

import { Queue, Worker } from 'bullmq';
import type { Job } from 'bullmq';

import { triggerTrashPurge } from './trash-purge.client';
import type { TrashPurgeStats } from './trash-purge.client';

export interface TrashPurgeRuntimeConfig {
  readonly apiInternalUrl: string;
  readonly cron: string;
  readonly redisUrl: string;
  readonly secret: string;
  readonly timezone: string;
}

export interface TrashPurgeHooks {
  readonly onCompleted: (stats: TrashPurgeStats) => void;
  readonly onFailed: (error: Error, attemptsMade: number) => void;
}

export interface TrashPurgeRuntime {
  readonly close: () => Promise<void>;
}

const QUEUE_NAME = 'trash-purge';
const SCHEDULER_KEY = 'trash-purge-daily';
const JOB_NAME = 'trash-purge';
const COMPLETION_AGE_SECONDS = 7 * 24 * 60 * 60;
const FAILURE_AGE_SECONDS = 30 * 24 * 60 * 60;

/** 用于执行一次清理并记录结构化结果，失败时抛错交给队列重试。 */
export async function processTrashPurgeJob(
  job: Job,
  config: TrashPurgeRuntimeConfig,
  hooks: TrashPurgeHooks,
): Promise<TrashPurgeStats> {
  try {
    const stats = await triggerTrashPurge({
      apiInternalUrl: config.apiInternalUrl,
      secret: config.secret,
    });
    hooks.onCompleted(stats);
    return stats;
  } catch (error: unknown) {
    hooks.onFailed(error instanceof Error ? error : new Error(String(error)), job.attemptsMade);
    throw error;
  }
}

/** 用于创建清理处理器便于测试注入配置与钩子。 */
export function createTrashPurgeProcessor(
  config: TrashPurgeRuntimeConfig,
  hooks: TrashPurgeHooks,
): (job: Job) => Promise<TrashPurgeStats> {
  return (job) => processTrashPurgeJob(job, config, hooks);
}

/** 用于注册幂等的每日清理调度并返回可关闭的运行时。 */
export async function startTrashPurgeRuntime(
  config: TrashPurgeRuntimeConfig,
  hooks: TrashPurgeHooks,
): Promise<TrashPurgeRuntime> {
  const connection = { url: config.redisUrl };
  const queue = new Queue(QUEUE_NAME, { connection });
  await queue.upsertJobScheduler(
    SCHEDULER_KEY,
    { pattern: config.cron, tz: config.timezone },
    {
      name: JOB_NAME,
      opts: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: { age: COMPLETION_AGE_SECONDS },
        removeOnFail: { age: FAILURE_AGE_SECONDS },
      },
    },
  );
  const worker = new Worker(QUEUE_NAME, createTrashPurgeProcessor(config, hooks), {
    connection,
    concurrency: 1,
  });
  return {
    /** 用于停机时关闭队列与工作者连接。 */
    async close(): Promise<void> {
      await worker.close();
      await queue.close();
    },
  };
}
