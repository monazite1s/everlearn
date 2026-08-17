/** @fileoverview 验证清理触发客户端的状态码与统计响应校验。 */

import { afterEach, expect, test, vi } from 'vitest';

import { triggerTrashPurge } from './trash-purge.client';

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
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ purgedDocuments: 2, purgedInboxItems: 1, purgedKnowledgeBases: 0 }),
      ),
  );
  const stats = await triggerTrashPurge({ apiInternalUrl: 'http://127.0.0.1:3001/', secret: 's' });
  expect(stats).toEqual({ purgedDocuments: 2, purgedInboxItems: 1, purgedKnowledgeBases: 0 });
});

test('throws on non-2xx endpoint responses', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 503)));
  await expect(
    triggerTrashPurge({ apiInternalUrl: 'http://127.0.0.1:3001', secret: 's' }),
  ).rejects.toThrow(/responded 503/);
});

test('throws on malformed stats payloads', async () => {
  for (const body of [
    null,
    {},
    { purgedDocuments: -1, purgedInboxItems: 0, purgedKnowledgeBases: 0 },
    { purgedDocuments: 1.5, purgedInboxItems: 0, purgedKnowledgeBases: 0 },
  ]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)));
    await expect(
      triggerTrashPurge({ apiInternalUrl: 'http://127.0.0.1:3001', secret: 's' }),
    ).rejects.toThrow(/malformed/);
  }
});
