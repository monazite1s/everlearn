/** @fileoverview 验证清理调度的注册幂等与处理器的结果日志。 */

import { Queue } from 'bullmq';
import { afterAll, describe, expect, test } from 'vitest';

import { startTrashPurgeRuntime } from './trash-purge.runtime';

const redisUrl = process.env.REDIS_URL ?? '';
const RUNTIME_CONFIG = {
  apiInternalUrl: 'http://127.0.0.1:3001',
  cron: '0 3 * * *',
  redisUrl: redisUrl ?? '',
  secret: 'test-secret',
  timezone: 'UTC',
};

/** 用于在测试结束后清除共享 Redis 中的清理队列。 */
async function cleanupQueue(): Promise<void> {
  const queue = new Queue('trash-purge', { connection: { url: redisUrl } });
  await queue.obliterate({ force: true });
  await queue.close();
}

describe.skipIf(process.env.REDIS_URL === undefined)('trash purge scheduling', () => {
  afterAll(() => cleanupQueue());

  test('repeated runtime startup keeps a single scheduler', async () => {
    const noopHooks = {
      /** 用于静默成功回调。 */
      onCompleted: () => undefined,
      /** 用于静默失败回调。 */
      onFailed: () => undefined,
    };
    const first = await startTrashPurgeRuntime(RUNTIME_CONFIG, noopHooks);
    const second = await startTrashPurgeRuntime(RUNTIME_CONFIG, noopHooks);

    const queue = new Queue('trash-purge', { connection: { url: redisUrl } });
    expect(await queue.getJobSchedulers()).toHaveLength(1);
    await queue.close();
    await second.close();
    await first.close();
  });
});
