/** @fileoverview 注册每日附件孤儿清理的幂等调度并处理带退避的清理作业。 */

import { Queue, Worker } from 'bullmq';
import type { Job } from 'bullmq';

import { triggerAttachmentOrphanPurge } from './attachment-orphan-purge.client';
import type { AttachmentOrphanPurgeStats } from './attachment-orphan-purge.client';

export interface AttachmentOrphanPurgeRuntimeConfig {
  readonly apiInternalUrl: string;
  readonly cron: string;
  readonly redisUrl: string;
  readonly secret: string;
  readonly timezone: string;
}

export interface AttachmentOrphanPurgeHooks {
  readonly onCompleted: (stats: AttachmentOrphanPurgeStats) => void;
  readonly onFailed: (error: Error, attemptsMade: number) => void;
}

export interface AttachmentOrphanPurgeRuntime {
  readonly close: () => Promise<void>;
}

const QUEUE_NAME = 'attachment-orphan-purge';
const SCHEDULER_KEY = 'attachment-orphan-purge-daily';
const JOB_NAME = 'attachment-orphan-purge';
const COMPLETION_AGE_SECONDS = 7 * 24 * 60 * 60;
const FAILURE_AGE_SECONDS = 30 * 24 * 60 * 60;

// ponytail: 与 trash-purge.runtime 结构重复属第二个每日任务实例，第三个调度出现时再抽共享调度工厂。
/** 用于执行一次附件孤儿清理，失败时抛错交给队列重试。 */
export async function processAttachmentOrphanPurgeJob(
  job: Job,
  config: AttachmentOrphanPurgeRuntimeConfig,
  hooks: AttachmentOrphanPurgeHooks,
): Promise<AttachmentOrphanPurgeStats> {
  try {
    const stats = await triggerAttachmentOrphanPurge({
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

/** 用于创建附件孤儿清理处理器便于测试注入配置与钩子。 */
export function createAttachmentOrphanPurgeProcessor(
  config: AttachmentOrphanPurgeRuntimeConfig,
  hooks: AttachmentOrphanPurgeHooks,
): (job: Job) => Promise<AttachmentOrphanPurgeStats> {
  return (job) => processAttachmentOrphanPurgeJob(job, config, hooks);
}

/** 用于注册幂等的每日附件孤儿清理调度并返回可关闭的运行时。 */
export async function startAttachmentOrphanPurgeRuntime(
  config: AttachmentOrphanPurgeRuntimeConfig,
  hooks: AttachmentOrphanPurgeHooks,
): Promise<AttachmentOrphanPurgeRuntime> {
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
  const worker = new Worker(QUEUE_NAME, createAttachmentOrphanPurgeProcessor(config, hooks), {
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
