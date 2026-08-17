/** @fileoverview 验证附件孤儿清理处理器对成功与失败回调的分派。 */

import { expect, test, vi } from 'vitest';

import { createAttachmentOrphanPurgeProcessor } from './attachment-orphan-purge.runtime';
import { triggerAttachmentOrphanPurge } from './attachment-orphan-purge.client';

vi.mock('./attachment-orphan-purge.client', () => ({
  /** 用于以受控实现替换真实附件清理触发。 */
  triggerAttachmentOrphanPurge: vi.fn(),
}));

const config = {
  apiInternalUrl: 'http://127.0.0.1:3001',
  cron: '0 4 * * *',
  redisUrl: 'redis://127.0.0.1:6380',
  secret: 's',
  timezone: 'UTC',
};

test('dispatches stats on success', async () => {
  vi.mocked(triggerAttachmentOrphanPurge).mockResolvedValue({ purgedAttachments: 4 });
  const completed = vi.fn();
  const failed = vi.fn();
  const processor = createAttachmentOrphanPurgeProcessor(config, {
    onCompleted: completed,
    onFailed: failed,
  });

  const stats = await processor({ attemptsMade: 1 } as never);
  expect(stats.purgedAttachments).toBe(4);
  expect(completed).toHaveBeenCalledWith(stats);
  expect(failed).not.toHaveBeenCalled();
});

test('rethrows failures after dispatching the failure hook', async () => {
  vi.mocked(triggerAttachmentOrphanPurge).mockRejectedValue(new Error('endpoint down'));
  const completed = vi.fn();
  const failed = vi.fn();
  const processor = createAttachmentOrphanPurgeProcessor(config, {
    onCompleted: completed,
    onFailed: failed,
  });

  await expect(processor({ attemptsMade: 2 } as never)).rejects.toThrow('endpoint down');
  expect(failed).toHaveBeenCalledWith(expect.any(Error), 2);
  expect(completed).not.toHaveBeenCalled();
});
