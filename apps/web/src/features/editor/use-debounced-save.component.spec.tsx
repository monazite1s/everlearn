/** @fileoverview 验证防抖保存状态机的聚合、基线推进、冲突与失败恢复行为。 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { DocumentContentDetail } from '@everlearn/contracts';

import { SAVE_DEBOUNCE_MS, useDebouncedSave } from './use-debounced-save';

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const fetchMock = vi.fn();

/** 用于构造单段落正文快照。 */
function snapshotOf(text: string, title?: string) {
  return {
    contentJson: {
      content: [{ content: [{ text, type: 'text' }], type: 'paragraph' }],
      type: 'doc',
    },
    ...(title !== undefined ? { title } : {}),
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

/** 用于构造完整合法的内容投影响应。 */
function contentDetail(version: number): DocumentContentDetail {
  return {
    childCount: 0,
    contentJson: { content: [], type: 'doc' },
    id: DOC_ID,
    knowledgeBaseId: '22222222-2222-4222-8222-222222222222',
    parentId: null,
    schemaVersion: 1,
    title: '标题',
    updatedAt: '2026-08-17T00:00:00.000Z',
    version,
  };
}

/** 用于挂载保存控制器并预置响应序列。 */
function mountSaver(...responses: readonly unknown[]) {
  for (const response of responses) {
    if (response instanceof Error) {
      fetchMock.mockRejectedValueOnce(response);
    } else {
      fetchMock.mockResolvedValueOnce(response);
    }
  }
  return renderHook(() => useDebouncedSave({ documentId: DOC_ID, initialVersion: 1 }));
}

/** 用于读取第 N 次提交请求体。 */
function submittedBody(call: number): Record<string, unknown> {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
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

test('防抖窗口内多次输入聚合为一次提交并携带最后快照', async () => {
  const { result } = mountSaver(jsonResponse(200, contentDetail(2)));
  act(() => result.current.stage(snapshotOf('输入一')));
  act(() => {
    vi.advanceTimersByTime(400);
  });
  expect(fetchMock).not.toHaveBeenCalled();
  act(() => result.current.stage(snapshotOf('输入二')));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(submittedBody(0).contentJson).toEqual(snapshotOf('输入二').contentJson);
  expect(result.current.status).toBe('saved');
});

test('保存成功后推进版本基线供后续提交使用', async () => {
  const { result } = mountSaver(
    jsonResponse(200, contentDetail(2)),
    jsonResponse(200, contentDetail(3)),
  );
  act(() => result.current.stage(snapshotOf('第一轮')));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
  });
  act(() => result.current.stage(snapshotOf('第二轮')));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(submittedBody(0).version).toBe(1);
  expect(submittedBody(1).version).toBe(2);
});

test('版本冲突后停止覆盖提交并保留最新本地内容供复制', async () => {
  const { result } = mountSaver(
    jsonResponse(409, {
      code: 'VERSION_CONFLICT',
      message: '资源已被其他操作更新，请刷新后重试。',
      requestId: '33333333-3333-4333-8333-333333333333',
    }),
  );
  act(() => result.current.stage(snapshotOf('冲突前输入')));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
  });
  expect(result.current.status).toBe('conflict');
  act(() => result.current.stage(snapshotOf('冲突后输入', '冲突标题')));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS * 2);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(result.current.copyLocalContent()).toBe('冲突标题\n\n冲突后输入');
});

test('网络失败进入失败态且手动重试成功后恢复保存', async () => {
  const { result } = mountSaver(new Error('network down'), jsonResponse(200, contentDetail(2)));
  act(() => result.current.stage(snapshotOf('待重试内容')));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SAVE_DEBOUNCE_MS);
  });
  expect(result.current.status).toBe('failed');
  act(() => {
    result.current.retry();
  });
  await act(async () => {
    await vi.runAllTimersAsync();
  });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(submittedBody(1).contentJson).toEqual(snapshotOf('待重试内容').contentJson);
  expect(result.current.status).toBe('saved');
});

test('本地内容可折叠为含标题与硬换行的纯文本', () => {
  const { result } = mountSaver();
  act(() =>
    result.current.stage({
      contentJson: {
        content: [
          { content: [{ text: '第一行', type: 'text' }], type: 'paragraph' },
          {
            content: [
              { text: '第二行', type: 'text' },
              { type: 'hardBreak' },
              { text: '第三行', type: 'text' },
            ],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      },
      title: '文档标题',
    }),
  );
  expect(result.current.copyLocalContent()).toBe('文档标题\n\n第一行\n\n第二行\n第三行');
});

test('卸载时对未提交内容发起一次不等待的保存', () => {
  const { result, unmount } = mountSaver(jsonResponse(200, contentDetail(2)));
  act(() => result.current.stage(snapshotOf('卸载前输入')));
  act(() => {
    unmount();
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(submittedBody(0).contentJson).toEqual(snapshotOf('卸载前输入').contentJson);
});
