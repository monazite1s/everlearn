/** @fileoverview 验证附件孤儿清理触发客户端的状态码与统计响应校验。 */

import { afterEach, expect, test, vi } from 'vitest';

import { triggerAttachmentOrphanPurge } from './attachment-orphan-purge.client';

/** 用于返回最小可用的 Fetch 响应。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于返回确定响应载荷。 */
    json: () => Promise.resolve(body),
    ok: status >= 200 && status < 300,
    status,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test('parses a closed stats response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ purgedAttachments: 3 })));
  const stats = await triggerAttachmentOrphanPurge({
    apiInternalUrl: 'http://127.0.0.1:3001/',
    secret: 's',
  });
  expect(stats).toEqual({ purgedAttachments: 3 });
});

test('throws on non-2xx endpoint responses', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 503)));
  await expect(
    triggerAttachmentOrphanPurge({ apiInternalUrl: 'http://127.0.0.1:3001', secret: 's' }),
  ).rejects.toThrow(/responded 503/);
});

test('throws on malformed stats payloads', async () => {
  for (const body of [null, {}, { purgedAttachments: -1 }, { purgedAttachments: 1.5 }]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)));
    await expect(
      triggerAttachmentOrphanPurge({ apiInternalUrl: 'http://127.0.0.1:3001', secret: 's' }),
    ).rejects.toThrow(/malformed/);
  }
});
