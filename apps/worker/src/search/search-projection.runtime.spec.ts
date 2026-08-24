/** @fileoverview 验证搜索投影启动触发与周期调度在 Redis 中幂等注册。 */

import { Queue } from 'bullmq';
import { afterAll, describe, expect, test } from 'vitest';

import { startSearchProjectionRuntime } from './search-projection.runtime';

const redisUrl = process.env.REDIS_URL ?? '';
const safeRedisHosts = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);
const queueName = `search-projection-runtime-${process.pid}`;
const config = {
  apiInternalUrl: 'http://127.0.0.1:1',
  intervalMs: 60_000,
  queueName,
  redisUrl,
  secret: 'test-secret',
};

/** 用于确保破坏性队列清理只会命中 Vitest 的本机 Redis。 */
function canCleanTestQueue(): boolean {
  if (process.env.NODE_ENV !== 'test' || redisUrl === '') return false;
  try {
    return safeRedisHosts.has(new URL(redisUrl).hostname);
  } catch {
    return false;
  }
}

/** 用于在测试结束后清除共享 Redis 中的测试专属队列。 */
async function cleanupQueue(): Promise<void> {
  if (!canCleanTestQueue()) throw new Error('Unsafe Redis cleanup target');
  const queue = new Queue(queueName, { connection: { url: redisUrl } });
  await queue.obliterate({ force: true });
  await queue.close();
}

describe.skipIf(!canCleanTestQueue())('search projection scheduling', () => {
  afterAll(() => cleanupQueue());

  test('restart recreates one scheduler and startup job after Redis state loss', async () => {
    const hooks = {
      /** 用于静默成功回调。 */
      onCompleted: () => undefined,
      /** 用于静默失败回调。 */
      onFailed: () => undefined,
    };
    const first = await startSearchProjectionRuntime(config, hooks);
    let queue = new Queue(queueName, { connection: { url: redisUrl } });
    expect(await queue.getJobSchedulers()).toHaveLength(1);
    expect(await queue.getJob('search-projection-startup')).toBeDefined();
    await first.close();
    await queue.obliterate({ force: true });
    expect(await queue.getJobSchedulers()).toEqual([]);
    await queue.close();

    const second = await startSearchProjectionRuntime(config, hooks);
    queue = new Queue(queueName, { connection: { url: redisUrl } });
    expect(await queue.getJobSchedulers()).toHaveLength(1);
    expect(await queue.getJob('search-projection-startup')).toBeDefined();
    await second.close();
    await queue.close();
  });
});
