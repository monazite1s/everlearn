/** @fileoverview 验证搜索投影触发客户端的内部边界与闭合统计校验。 */

import { afterEach, expect, test, vi } from 'vitest';

import { triggerSearchProjection } from './search-projection.client';

/** 用于返回最小可用的 Fetch 响应。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于返回确定响应载荷。 */
    json: () => Promise.resolve(body),
    ok: status >= 200 && status < 300,
    status,
  } as Response;
}

afterEach(() => vi.unstubAllGlobals());

test('posts to the protected endpoint and parses closed stats', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      jsonResponse({ processedEvents: 3, quarantinedEvents: 1, scannedDocuments: 2 }),
    );
  vi.stubGlobal('fetch', fetchMock);
  const stats = await triggerSearchProjection({
    apiInternalUrl: 'http://127.0.0.1:3001/',
    secret: 's',
  });
  expect(stats).toEqual({ processedEvents: 3, quarantinedEvents: 1, scannedDocuments: 2 });
  expect(fetchMock).toHaveBeenCalledWith(
    'http://127.0.0.1:3001/api/v1/internal/search-projection',
    expect.objectContaining({
      headers: { 'x-purge-secret': 's' },
      method: 'POST',
      redirect: 'error',
    }),
  );
});

test('throws on non-2xx endpoint responses', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 503)));
  await expect(
    triggerSearchProjection({ apiInternalUrl: 'http://127.0.0.1:3001', secret: 's' }),
  ).rejects.toThrow(/responded 503/);
});

test('throws on malformed stats payloads', async () => {
  for (const body of [
    null,
    {},
    { processedEvents: -1, quarantinedEvents: 0, scannedDocuments: 0 },
    { processedEvents: 1.5, quarantinedEvents: 0, scannedDocuments: 0 },
  ]) {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(body)));
    await expect(
      triggerSearchProjection({ apiInternalUrl: 'http://127.0.0.1:3001', secret: 's' }),
    ).rejects.toThrow(/malformed/);
  }
});

test('rejects non-loopback HTTP before sending the internal secret', async () => {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  await expect(
    triggerSearchProjection({ apiInternalUrl: 'http://api.internal.example', secret: 's' }),
  ).rejects.toThrow(/requires HTTPS/u);
  expect(fetchMock).not.toHaveBeenCalled();
});
