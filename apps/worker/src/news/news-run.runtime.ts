/**
 * @fileoverview 注册资讯简报队列、待执行领取轮询与每日/每周计划同步。
 */

import { Queue, Worker } from 'bullmq';

import { toCronExpression } from '../workflows/workflow-run.runtime';
import {
  createScheduledNewsDigest,
  dispatchNewsDigests,
  listNewsSchedules,
} from './news-api-client';
import type { NewsDigestDispatchItem } from './news-api-client';
import { executeNewsDigest } from './news-digest.executor';
import type { NewsDigestExecutorConfig } from './news-digest.executor';

export interface NewsRuntimeConfig extends NewsDigestExecutorConfig {
  readonly redisUrl: string;
}

export interface NewsRuntime {
  readonly close: () => Promise<void>;
}

const QUEUE_NAME = 'news-digest';
const DISPATCH_INTERVAL_MS = 2_000;
const SCHEDULE_SYNC_INTERVAL_MS = 60_000;
const SCHEDULED_JOB_PREFIX = 'news';

/** 用于执行一次待执行简报领取并入队。 */
export async function dispatchPendingDigests(
  queue: Queue,
  config: NewsRuntimeConfig,
): Promise<number> {
  const items = await dispatchNewsDigests(config, 3);
  for (const item of items) {
    await queue.add('news-digest', { digest: item }, { jobId: `run-${item.runId}` });
  }
  return items.length;
}

/** 用于同步订阅计划：先移除旧计划再注册新计划。 */
export async function syncNewsSchedules(queue: Queue, config: NewsRuntimeConfig): Promise<void> {
  const schedules = await listNewsSchedules(config);
  const activeKeys = new Set<string>();
  for (const item of schedules) {
    const key = `${SCHEDULED_JOB_PREFIX}-schedule:${item.subscriptionId}`;
    activeKeys.add(key);
    await queue.removeJobScheduler(key).catch(() => undefined);
    await queue.upsertJobScheduler(key, {
      pattern: toCronExpression(item.schedule),
      tz: item.schedule.timezone,
    });
  }
  const existing = await queue.getJobSchedulers();
  for (const scheduler of existing) {
    if (
      scheduler.key.startsWith(`${SCHEDULED_JOB_PREFIX}-schedule:`) &&
      !activeKeys.has(scheduler.key)
    ) {
      await queue.removeJobScheduler(scheduler.key);
    }
  }
}

/** 用于处理计划触发作业：为订阅创建或复用当天简报运行，执行交给领取轮询。 */
export async function processNewsScheduleJob(
  job: { data: { digest?: NewsDigestDispatchItem; subscriptionId?: string } },
  config: NewsRuntimeConfig,
): Promise<void> {
  if (job.data.digest !== undefined) {
    await executeNewsDigest(job.data.digest, config);
    return;
  }
  if (job.data.subscriptionId !== undefined) {
    await createScheduledNewsDigest(config, job.data.subscriptionId);
  }
}

/** 用于启动资讯运行时并注册轮询与关闭钩子。 */
export async function startNewsRuntime(config: NewsRuntimeConfig): Promise<NewsRuntime> {
  const connection = { url: config.redisUrl };
  const queue = new Queue(QUEUE_NAME, { connection });
  const worker = new Worker(QUEUE_NAME, async (job) => processNewsScheduleJob(job, config), {
    connection,
    concurrency: 1,
  });
  const dispatchTimer = setInterval(() => {
    dispatchPendingDigests(queue, config).catch(() => undefined);
  }, DISPATCH_INTERVAL_MS);
  await dispatchPendingDigests(queue, config).catch(() => undefined);
  const scheduleTimer = setInterval(() => {
    syncNewsSchedules(queue, config).catch(() => undefined);
  }, SCHEDULE_SYNC_INTERVAL_MS);
  await syncNewsSchedules(queue, config).catch(() => undefined);
  return {
    /** 用于停止轮询并关闭队列与 Worker。 */
    close: async () => {
      clearInterval(dispatchTimer);
      clearInterval(scheduleTimer);
      await worker.close();
      await queue.close();
    },
  };
}
