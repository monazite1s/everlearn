/** @fileoverview 验证恢复预览数据 hook 与恢复提交客户端的语义。 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import type { DocumentContentDetail } from '@everlearn/contracts';

import { restoreDocumentRevision } from './editor-api';
import { useRevisionPreview } from './use-revision-preview';

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const fetchMock = vi.fn();

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
    contentJson: {
      content: [{ attrs: { blockId: '44444444-4444-4444-8444-444444444444' }, type: 'paragraph' }],
      type: 'doc',
    },
    createdAt: '2026-08-18T00:00:00.000000Z',
    plainText: '历史快照全文',
    revisionNumber,
    schemaVersion: 1,
    snippet: '历史快照全文',
    source: 'manual',
    title: '历史标题',
  };
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
    title: '恢复后的标题',
    updatedAt: '2026-08-18T00:00:00.000000Z',
    version,
  };
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

test('预览按修订号读取全文快照并进入已加载态', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse(200, revisionDetail(4)));
  const { result } = renderHook(() =>
    useRevisionPreview({ documentId: DOC_ID, revisionNumber: 4 }),
  );
  expect(result.current.status).toBe('loading');
  await waitFor(() => expect(result.current.status).toBe('loaded'));
  expect(result.current.revision).toMatchObject({ revisionNumber: 4, title: '历史标题' });
  expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/documents/${DOC_ID}/revisions/4`);
});

test('预览读取失败进入失败态且手动重试可恢复', async () => {
  fetchMock
    .mockResolvedValueOnce(
      jsonResponse(404, {
        code: 'NOT_FOUND',
        message: '请求的资源不存在或不可访问。',
        requestId: '33333333-3333-4333-8333-333333333333',
      }),
    )
    .mockResolvedValueOnce(jsonResponse(200, revisionDetail(2)));
  const { result } = renderHook(() =>
    useRevisionPreview({ documentId: DOC_ID, revisionNumber: 2 }),
  );
  await waitFor(() => expect(result.current.status).toBe('failed'));
  expect(result.current.revision).toBeUndefined();
  act(() => {
    result.current.retry();
  });
  await waitFor(() => expect(result.current.status).toBe('loaded'));
  expect(result.current.revision?.revisionNumber).toBe(2);
});

test('恢复客户端提交当前版本并把响应收敛为内容投影', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse(200, contentDetail(6)));
  const result = await restoreDocumentRevision(DOC_ID, 4, { version: 5 });
  expect(result.ok).toBe(true);
  if (result.ok) expect(result.data).toEqual(contentDetail(6));
  const entry = fetchMock.mock.calls[0] as unknown as readonly [string, RequestInit];
  expect(entry[0]).toBe(`/api/v1/documents/${DOC_ID}/revisions/4/restore`);
  expect(entry[1].method).toBe('POST');
  expect(JSON.parse(entry[1].body as string)).toEqual({ version: 5 });
});

test('恢复客户端拒绝无法识别的响应投影', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse(200, { unexpected: true }));
  const result = await restoreDocumentRevision(DOC_ID, 4, { version: 5 });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.certainty).toBe('unknown');
});
