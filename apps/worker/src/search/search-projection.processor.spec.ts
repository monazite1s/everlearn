/** @fileoverview 验证搜索投影处理器分派成功统计并把失败交给 BullMQ 重试。 */

import { expect, test, vi } from 'vitest';

import { triggerSearchProjection } from './search-projection.client';
import {
  createSearchProjectionProcessor,
  removeTerminalStartupJob,
} from './search-projection.runtime';

vi.mock('./search-projection.client', () => ({
  /** 用于以受控实现替换真实内部请求。 */
  triggerSearchProjection: vi.fn(),
}));

const config = {
  apiInternalUrl: 'http://127.0.0.1:3001',
  intervalMs: 60_000,
  redisUrl: 'redis://127.0.0.1:6380',
  secret: 's',
};

test('dispatches projection stats on success', async () => {
  const stats = { processedEvents: 3, quarantinedEvents: 1, scannedDocuments: 2 };
  vi.mocked(triggerSearchProjection).mockResolvedValue(stats);
  const completed = vi.fn();
  const failed = vi.fn();
  const processor = createSearchProjectionProcessor(config, {
    onCompleted: completed,
    onFailed: failed,
  });
  await expect(processor({ attemptsMade: 1 } as never)).resolves.toEqual(stats);
  expect(completed).toHaveBeenCalledWith(stats);
  expect(failed).not.toHaveBeenCalled();
});

test('rethrows failures after dispatching the failure hook', async () => {
  vi.mocked(triggerSearchProjection).mockRejectedValue(new Error('endpoint down'));
  const completed = vi.fn();
  const failed = vi.fn();
  const processor = createSearchProjectionProcessor(config, {
    onCompleted: completed,
    onFailed: failed,
  });
  await expect(processor({ attemptsMade: 2 } as never)).rejects.toThrow('endpoint down');
  expect(failed).toHaveBeenCalledWith(expect.any(Error), 2);
  expect(completed).not.toHaveBeenCalled();
});

test('removes a terminal startup job before runtime restart', async () => {
  const remove = vi.fn().mockResolvedValue(undefined);
  const queue = {
    getJob: vi.fn().mockResolvedValue({ getState: vi.fn().mockResolvedValue('failed'), remove }),
  };
  await removeTerminalStartupJob(queue as never);
  expect(remove).toHaveBeenCalledOnce();
});
