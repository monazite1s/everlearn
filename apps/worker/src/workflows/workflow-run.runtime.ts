/**
 * @fileoverview 注册 Workflow 运行队列、待执行领取轮询与每日/每周计划同步。
 */

import { Queue, Worker } from 'bullmq';

import {
  createScheduledRun,
  dispatchWorkflowRuns,
  listWorkflowSchedules,
} from './workflow-api-client';
import { executeWorkflowRun } from './workflow-run.executor';
import type { WorkflowRunExecutorConfig } from './workflow-run.executor';

export interface WorkflowRuntimeConfig extends WorkflowRunExecutorConfig {
  readonly queueName?: string;
  readonly redisUrl: string;
}

export interface WorkflowRuntime {
  readonly close: () => Promise<void>;
}

const QUEUE_NAME = 'workflow-run';
const DISPATCH_INTERVAL_MS = 2_000;
const SCHEDULE_SYNC_INTERVAL_MS = 60_000;
// ponytail: 以「当天活跃运行复用」近似 scheduleId+scheduledAt 幂等；升级条件为出现跨天重放或错过补跑需求。
const SCHEDULED_JOB_PREFIX = 'workflow';

/** 用于把每日/每周计划转换为 BullMQ cron 表达式。 */
export function toCronExpression(schedule: { kind: string; time: string }): string {
  const [hour = '0', minute = '0'] = schedule.time.split(':');
  const dayOfWeek = schedule.kind === 'weekly' ? '1' : '*';
  return `${Number(minute)} ${Number(hour)} * * ${dayOfWeek}`;
}

/** 用于执行一次待运行领取并入队。 */
export async function dispatchPendingRuns(
  queue: Queue,
  config: WorkflowRuntimeConfig,
): Promise<number> {
  const items = await dispatchWorkflowRuns(config, 3);
  for (const item of items) {
    await queue.add('workflow-run', { runId: item.runId }, { jobId: `run:${item.runId}` });
  }
  return items.length;
}

/** 用于同步计划任务：先移除旧计划再注册新计划。 */
export async function syncWorkflowSchedules(
  queue: Queue,
  config: WorkflowRuntimeConfig,
): Promise<void> {
  const schedules = await listWorkflowSchedules(config);
  const activeKeys = new Set<string>();
  for (const item of schedules) {
    const key = `${SCHEDULED_JOB_PREFIX}-schedule:${item.workflowId}`;
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

/** 用于处理一次队列作业：计划触发创建运行，手动触发直接执行。 */
export async function processWorkflowJob(
  job: { data: { runId?: string; workflowId?: string } },
  queue: Queue,
  config: WorkflowRuntimeConfig,
): Promise<void> {
  let runId = job.data.runId;
  if (runId === undefined && job.data.workflowId !== undefined) {
    const day = Math.floor(Date.now() / 86_400_000);
    const { runId: scheduledRunId } = await createScheduledRun(config, job.data.workflowId);
    runId = scheduledRunId;
    await queue.add(
      'workflow-run',
      { runId },
      { jobId: `${SCHEDULED_JOB_PREFIX}:${job.data.workflowId}:${day}` },
    );
  }
  if (runId !== undefined) await executeWorkflowRun(runId, config);
}

/** 用于启动 Workflow 运行时并注册轮询与关闭钩子。 */
export async function startWorkflowRuntime(
  config: WorkflowRuntimeConfig,
): Promise<WorkflowRuntime> {
  const connection = { url: config.redisUrl };
  const queue = new Queue(config.queueName ?? QUEUE_NAME, { connection });
  const worker = new Worker(
    config.queueName ?? QUEUE_NAME,
    async (job) => processWorkflowJob(job, queue, config),
    { connection, concurrency: 1 },
  );
  const dispatchTimer = setInterval(() => {
    dispatchPendingRuns(queue, config).catch(() => undefined);
  }, DISPATCH_INTERVAL_MS);
  await dispatchPendingRuns(queue, config).catch(() => undefined);
  const scheduleTimer = setInterval(() => {
    syncWorkflowSchedules(queue, config).catch(() => undefined);
  }, SCHEDULE_SYNC_INTERVAL_MS);
  await syncWorkflowSchedules(queue, config).catch(() => undefined);
  return {
    /** 用于停止轮询定时器并释放 Worker 与队列。 */
    close: async () => {
      clearInterval(dispatchTimer);
      clearInterval(scheduleTimer);
      await worker.close();
      await queue.close();
    },
  };
}
