/** @fileoverview 验证修订触发器在持续编辑间隔与卸载路径的提交语义。 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { REVISION_INTERVAL_MS, useRevisionTriggers } from './use-revision-triggers';

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const fetchMock = vi.fn();

/** 用于构造单段落正文快照。 */
function snapshotOf(text: string, title?: string) {
  return {
    contentJson: {
      content: [{ content: [{ text, type: 'text' }], type: 'paragraph' }],
      type: 'doc',
    },
    ...(title === undefined ? {} : { title }),
  };
}

/** 用于返回预置响应体的桩函数。 */
const jsonStub =
  (body: unknown): (() => unknown) =>
  () =>
    body;

/** 用于构造最小响应桩，覆盖请求层只依赖的 status 与 json。 */
function jsonResponse(status: number, body: unknown) {
  return { json: jsonStub(body), status };
}

/** 用于构造最小合法的修订详情响应。 */
function revisionDetail(revisionNumber: number) {
  return {
    contentJson: { content: [], type: 'doc' },
    createdAt: '2026-08-18T00:00:00.000000Z',
    plainText: '',
    revisionNumber,
    schemaVersion: 1,
    snippet: '',
    source: 'manual',
    title: '标题',
  };
}

/** 用于挂载修订触发器并预置响应序列。 */
function mountTriggers(...responses: readonly unknown[]) {
  for (const response of responses) {
    if (response instanceof Error) {
      fetchMock.mockRejectedValueOnce(response);
    } else {
      fetchMock.mockResolvedValueOnce(response);
    }
  }
  return renderHook(() => useRevisionTriggers({ documentId: DOC_ID, initialVersion: 3 }));
}

/** 用于读取第 N 次提交请求的 URL 与请求体。 */
function submittedCall(call: number): { body: Record<string, unknown>; url: string } {
  const entry = fetchMock.mock.calls[call] as unknown as readonly [string, RequestInit];
  return { body: JSON.parse(entry[1].body as string) as Record<string, unknown>, url: entry[0] };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fetchMock.mockReset();
});

test('持续编辑间隔到点提交一次修订且无变更不再重复提交', async () => {
  const { result } = mountTriggers(
    jsonResponse(201, revisionDetail(2)),
    jsonResponse(201, revisionDetail(3)),
  );
  act(() => result.current.stage(snapshotOf('第一版')));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(REVISION_INTERVAL_MS);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const first = submittedCall(0);
  expect(first.url).toBe(`/api/v1/documents/${DOC_ID}/revisions`);
  expect(first.body).toMatchObject({ schemaVersion: 1, version: 3 });
  expect('title' in first.body).toBe(false);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(REVISION_INTERVAL_MS * 3);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  act(() => result.current.stage(snapshotOf('第二版')));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(REVISION_INTERVAL_MS);
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('从未聚合内容时间隔与卸载都不提交修订', async () => {
  const { unmount } = mountTriggers();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(REVISION_INTERVAL_MS * 2);
  });
  act(() => {
    unmount();
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

test('卸载时对未快照内容发起一次不等待的修订提交', async () => {
  const { result, unmount } = mountTriggers(jsonResponse(201, revisionDetail(2)));
  act(() => result.current.stage(snapshotOf('卸载前内容')));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  act(() => {
    unmount();
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(submittedCall(0).body.contentJson).toEqual(snapshotOf('卸载前内容').contentJson);
});

test('网络失败保留基线供下个间隔重试', async () => {
  const { result } = mountTriggers(new Error('network down'), jsonResponse(201, revisionDetail(2)));
  act(() => result.current.stage(snapshotOf('待重试内容')));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(REVISION_INTERVAL_MS);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(REVISION_INTERVAL_MS);
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(submittedCall(1).body.contentJson).toEqual(snapshotOf('待重试内容').contentJson);
});

test('服务端给出确定结论后不再重复提交同一快照', async () => {
  const { result } = mountTriggers(
    jsonResponse(409, {
      code: 'VERSION_CONFLICT',
      message: '资源已被其他操作更新，请刷新后重试。',
      requestId: '33333333-3333-4333-8333-333333333333',
    }),
  );
  act(() => result.current.stage(snapshotOf('冲突内容')));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(REVISION_INTERVAL_MS);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(REVISION_INTERVAL_MS);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
