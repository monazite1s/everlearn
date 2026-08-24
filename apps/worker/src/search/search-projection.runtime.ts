/** @fileoverview 注册 Search 启动触发与周期调度并处理带退避的投影作业。 */

import { Queue, Worker } from 'bullmq';
import type { Job } from 'bullmq';

import { triggerSearchProjection } from './search-projection.client';
import type { SearchProjectionStats } from './search-projection.client';

export interface SearchProjectionRuntimeConfig {
  readonly apiInternalUrl: string;
  readonly intervalMs: number;
  readonly queueName?: string;
  readonly redisUrl: string;
  readonly secret: string;
}

export interface SearchProjectionHooks {
  readonly onCompleted: (stats: SearchProjectionStats) => void;
  readonly onFailed: (error: Error, attemptsMade: number) => void;
}

export interface SearchProjectionRuntime {
  readonly close: () => Promise<void>;
}

const QUEUE_NAME = 'search-projection';
const SCHEDULER_KEY = 'search-projection-periodic';
const STARTUP_JOB_ID = 'search-projection-startup';
const JOB_NAME = 'search-projection';
const COMPLETION_AGE_SECONDS = 24 * 60 * 60;
const FAILURE_AGE_SECONDS = 7 * 24 * 60 * 60;

/** 用于执行一次投影触发并把失败重新抛给队列退避。 */
export async function processSearchProjectionJob(
  job: Job,
  config: SearchProjectionRuntimeConfig,
  hooks: SearchProjectionHooks,
): Promise<SearchProjectionStats> {
  try {
    const stats = await triggerSearchProjection({
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

/** 用于创建可注入配置与日志钩子的搜索投影处理器。 */
export function createSearchProjectionProcessor(
  config: SearchProjectionRuntimeConfig,
  hooks: SearchProjectionHooks,
): (job: Job) => Promise<SearchProjectionStats> {
  return (job) => processSearchProjectionJob(job, config, hooks);
}

/** 用于移除会阻挡本次启动恢复的旧终态作业并保留仍在执行的去重作业。 */
export async function removeTerminalStartupJob(queue: Queue): Promise<void> {
  const existing = await queue.getJob(STARTUP_JOB_ID);
  if (existing === undefined) return;
  const state = await existing.getState();
  if (state !== 'completed' && state !== 'failed') return;
  try {
    await existing.remove();
  } catch (error: unknown) {
    if ((await queue.getJob(STARTUP_JOB_ID)) !== undefined) throw error;
  }
}

/** 用于注册幂等周期调度并追加一次可去重的启动恢复作业。 */
export async function startSearchProjectionRuntime(
  config: SearchProjectionRuntimeConfig,
  hooks: SearchProjectionHooks,
): Promise<SearchProjectionRuntime> {
  const connection = { url: config.redisUrl };
  const queueName = config.queueName ?? QUEUE_NAME;
  const queue = new Queue(queueName, { connection });
  const retryOptions = {
    attempts: 5,
    backoff: { delay: 5_000, type: 'exponential' as const },
    removeOnComplete: { age: COMPLETION_AGE_SECONDS },
    removeOnFail: { age: FAILURE_AGE_SECONDS },
  };
  await queue.upsertJobScheduler(
    SCHEDULER_KEY,
    { every: config.intervalMs },
    { name: JOB_NAME, opts: retryOptions },
  );
  await removeTerminalStartupJob(queue);
  await queue.add(JOB_NAME, {}, { ...retryOptions, jobId: STARTUP_JOB_ID, removeOnComplete: true });
  const worker = new Worker(queueName, createSearchProjectionProcessor(config, hooks), {
    concurrency: 1,
    connection,
  });
  return {
    /** 用于停机时关闭工作者和队列连接。 */
    async close(): Promise<void> {
      await worker.close();
      await queue.close();
    },
  };
}
