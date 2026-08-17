/** @fileoverview 验证附件孤儿清理调度的注册幂等。 */

import { Queue } from 'bullmq';
import { afterAll, describe, expect, test } from 'vitest';

import { startAttachmentOrphanPurgeRuntime } from './attachment-orphan-purge.runtime';

const redisUrl = process.env.REDIS_URL ?? '';
const RUNTIME_CONFIG = {
  apiInternalUrl: 'http://127.0.0.1:3001',
  cron: '0 4 * * *',
  redisUrl: redisUrl ?? '',
  secret: 'test-secret',
  timezone: 'UTC',
};

/** 用于在测试结束后清除共享 Redis 中的附件清理队列。 */
async function cleanupQueue(): Promise<void> {
  const queue = new Queue('attachment-orphan-purge', { connection: { url: redisUrl } });
  await queue.obliterate({ force: true });
  await queue.close();
}

describe.skipIf(process.env.REDIS_URL === undefined)('attachment orphan purge scheduling', () => {
  afterAll(() => cleanupQueue());

  test('repeated runtime startup keeps a single scheduler', async () => {
    const noopHooks = {
      /** 用于静默成功回调。 */
      onCompleted: () => undefined,
      /** 用于静默失败回调。 */
      onFailed: () => undefined,
    };
    const first = await startAttachmentOrphanPurgeRuntime(RUNTIME_CONFIG, noopHooks);
    const second = await startAttachmentOrphanPurgeRuntime(RUNTIME_CONFIG, noopHooks);

    const queue = new Queue('attachment-orphan-purge', { connection: { url: redisUrl } });
    const schedulers = await queue.getJobSchedulers();
    expect(schedulers).toHaveLength(1);
    expect(schedulers[0]?.key).toBe('attachment-orphan-purge-daily');
    await queue.close();
    await second.close();
    await first.close();
  });
});
