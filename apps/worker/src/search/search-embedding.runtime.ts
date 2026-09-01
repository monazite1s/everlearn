/** @fileoverview 注册搜索向量回填周期调度并处理带退避的回填作业。 */

import { Queue, Worker } from 'bullmq';
import type { Job } from 'bullmq';

import { triggerSearchEmbeddingBackfill } from './search-embedding.client';
import type { SearchEmbeddingStats } from './search-embedding.client';

export interface SearchEmbeddingRuntimeConfig {
  readonly apiInternalUrl: string;
  readonly intervalMs: number;
  readonly queueName?: string;
  readonly redisUrl: string;
  readonly secret: string;
}

export interface SearchEmbeddingHooks {
  readonly onCompleted: (stats: SearchEmbeddingStats) => void;
  readonly onFailed: (error: Error, attemptsMade: number) => void;
}

export interface SearchEmbeddingRuntime {
  readonly close: () => Promise<void>;
}

const QUEUE_NAME = 'search-embedding';
const SCHEDULER_KEY = 'search-embedding-periodic';
const JOB_NAME = 'search-embedding';
const COMPLETION_AGE_SECONDS = 24 * 60 * 60;
const FAILURE_AGE_SECONDS = 7 * 24 * 60 * 60;

/** 用于执行一次向量回填触发并把失败重新抛给队列退避。 */
export async function processSearchEmbeddingJob(
  job: Job,
  config: SearchEmbeddingRuntimeConfig,
  hooks: SearchEmbeddingHooks,
): Promise<SearchEmbeddingStats> {
  try {
    const stats = await triggerSearchEmbeddingBackfill({
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

/** 用于创建可注入配置与日志钩子的向量回填处理器。 */
export function createSearchEmbeddingProcessor(
  config: SearchEmbeddingRuntimeConfig,
  hooks: SearchEmbeddingHooks,
): (job: Job) => Promise<SearchEmbeddingStats> {
  return (job) => processSearchEmbeddingJob(job, config, hooks);
}

/** 用于注册幂等的向量回填周期调度。 */
export async function startSearchEmbeddingRuntime(
  config: SearchEmbeddingRuntimeConfig,
  hooks: SearchEmbeddingHooks,
): Promise<SearchEmbeddingRuntime> {
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
  const worker = new Worker(queueName, createSearchEmbeddingProcessor(config, hooks), {
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
