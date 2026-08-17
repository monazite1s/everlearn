/** @fileoverview 验证清理处理器对成功与失败回调的分派。 */

import { expect, test, vi } from 'vitest';

import { createTrashPurgeProcessor } from './trash-purge.runtime';
import { triggerTrashPurge } from './trash-purge.client';

vi.mock('./trash-purge.client', () => ({
  /** 用于以受控实现替换真实清理触发。 */
  triggerTrashPurge: vi.fn(),
}));

const config = {
  apiInternalUrl: 'http://127.0.0.1:3001',
  cron: '0 3 * * *',
  redisUrl: 'redis://127.0.0.1:6380',
  secret: 's',
  timezone: 'UTC',
};

test('dispatches stats on success', async () => {
  vi.mocked(triggerTrashPurge).mockResolvedValue({
    purgedDocuments: 3,
    purgedInboxItems: 1,
    purgedKnowledgeBases: 2,
  });
  const completed = vi.fn();
  const failed = vi.fn();
  const processor = createTrashPurgeProcessor(config, { onCompleted: completed, onFailed: failed });

  const stats = await processor({ attemptsMade: 1 } as never);
  expect(stats.purgedDocuments).toBe(3);
  expect(completed).toHaveBeenCalledWith(stats);
  expect(failed).not.toHaveBeenCalled();
});

test('rethrows failures after dispatching the failure hook', async () => {
  vi.mocked(triggerTrashPurge).mockRejectedValue(new Error('endpoint down'));
  const completed = vi.fn();
  const failed = vi.fn();
  const processor = createTrashPurgeProcessor(config, { onCompleted: completed, onFailed: failed });

  await expect(processor({ attemptsMade: 2 } as never)).rejects.toThrow('endpoint down');
  expect(failed).toHaveBeenCalledWith(expect.any(Error), 2);
  expect(completed).not.toHaveBeenCalled();
});
