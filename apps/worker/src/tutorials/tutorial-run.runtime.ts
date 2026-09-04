/**
 * @fileoverview 注册教程研究、章节生成队列与待执行领取轮询。
 */

import { Queue, Worker } from 'bullmq';

import { dispatchTutorialChapters, dispatchTutorialOutlineSessions } from './tutorial-api-client';
import type { TutorialExecutorConfig } from './tutorial-api-client';
import { createChapterDeps, executeTutorialChapter } from './tutorial-chapter.executor';
import { createOutlineDeps, executeTutorialOutline } from './tutorial-outline.executor';
import type { TutorialWebSearchProvider } from './tutorial-research';

export interface TutorialRuntimeConfig extends TutorialExecutorConfig {
  readonly redisUrl: string;
}

export interface TutorialRuntime {
  readonly close: () => Promise<void>;
}

const QUEUE_NAME = 'tutorial';
const DISPATCH_INTERVAL_MS = 2_000;

/** 用于领取待研究会话并入队。 */
export async function dispatchPendingOutlineSessions(
  queue: Queue,
  config: TutorialRuntimeConfig,
): Promise<number> {
  const items = await dispatchTutorialOutlineSessions(config, 3);
  for (const item of items) {
    await queue.add('tutorial-outline', item, { jobId: `outline-${item.sessionId}` });
  }
  return items.length;
}

/** 用于领取依赖已满足的待生成章节并入队。 */
export async function dispatchPendingChapters(
  queue: Queue,
  config: TutorialRuntimeConfig,
): Promise<number> {
  const items = await dispatchTutorialChapters(config, 5);
  for (const item of items) {
    await queue.add('tutorial-chapter', item, {
      jobId: `chapter-${item.chapterId}-attempt-${item.attempt}`,
    });
  }
  return items.length;
}

/** 用于处理单个教程作业并按名称分派执行器。 */
export async function processTutorialJob(
  job: { data: Record<string, unknown>; name: string },
  config: TutorialRuntimeConfig,
  search: TutorialWebSearchProvider | undefined,
): Promise<void> {
  if (job.name === 'tutorial-outline') {
    const item = job.data as never as Parameters<typeof executeTutorialOutline>[0];
    await executeTutorialOutline(item, {
      ...createOutlineDeps(config, item.sessionId),
      ...(search === undefined ? {} : { search }),
    });
    return;
  }
  if (job.name === 'tutorial-chapter') {
    const item = job.data as never as Parameters<typeof executeTutorialChapter>[0];
    await executeTutorialChapter(item, {
      ...createChapterDeps(config, item.chapterId),
      ...(search === undefined ? {} : { search }),
    });
  }
}

/** 用于启动教程运行时并注册领取轮询与关闭钩子。 */
export async function startTutorialRuntime(
  config: TutorialRuntimeConfig,
  search?: TutorialWebSearchProvider,
): Promise<TutorialRuntime> {
  const connection = { url: config.redisUrl };
  const queue = new Queue(QUEUE_NAME, { connection });
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => processTutorialJob(job as never, config, search),
    {
      connection,
      concurrency: 2,
    },
  );
  const dispatchTimer = setInterval(() => {
    dispatchPendingOutlineSessions(queue, config).catch(() => undefined);
    dispatchPendingChapters(queue, config).catch(() => undefined);
  }, DISPATCH_INTERVAL_MS);
  await dispatchPendingOutlineSessions(queue, config).catch(() => undefined);
  await dispatchPendingChapters(queue, config).catch(() => undefined);
  return {
    /** 用于停止轮询并关闭队列与 Worker。 */
    close: async () => {
      clearInterval(dispatchTimer);
      await worker.close();
      await queue.close();
    },
  };
}
