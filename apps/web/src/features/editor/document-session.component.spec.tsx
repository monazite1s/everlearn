/** @fileoverview 验证编辑会话的保存序列、冲突只读、重载与复制行为。 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type {
  DocumentContentDetail,
  DocumentRevisionDetail,
  DocumentRevisionListItem,
} from '@everlearn/contracts';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { EditorWorkbench } from './editor-workbench';
import { REVISION_INTERVAL_MS } from './use-revision-triggers';

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const KB_ID = '22222222-2222-4222-8222-222222222222';
const fetchMock = vi.fn();

/** 用于构造最小内容投影。 */
function contentDetail(overrides: Partial<DocumentContentDetail> = {}): DocumentContentDetail {
  return {
    childCount: 0,
    contentJson: {
      content: [{ content: [{ text: '初始正文', type: 'text' }], type: 'paragraph' }],
      type: 'doc',
    },
    id: DOC_ID,
    knowledgeBaseId: KB_ID,
    parentId: null,
    schemaVersion: 1,
    title: '初始标题',
    updatedAt: '2026-08-17T08:00:00.000Z',
    version: 1,
    ...overrides,
  };
}

/** 用于构造最小响应桩。 */
/** 用于返回确定响应载荷的桩函数。 */
const jsonStub =
  (body: unknown): (() => Promise<unknown>) =>
  () =>
    Promise.resolve(body);

/** 用于构造最小响应桩。 */
function jsonResponse(body: unknown, status = 200): Response {
  return { json: jsonStub(body), status } as Response;
}

/** 用于挂载编辑会话（窄屏形态，不触发侧栏列表请求）。 */
function mountWorkbench(initial = contentDetail()): ReturnType<typeof render> {
  return render(
    <EditorWorkbench
      initialDetail={initial}
      knowledgeBaseId={KB_ID}
      offline={false}
      wide={false}
    />,
  );
}

/** 用于挂载宽屏会话，侧栏页签在挂载时请求修订列表。 */
function mountWideWorkbench(initial = contentDetail()): ReturnType<typeof render> {
  return render(
    <EditorWorkbench initialDetail={initial} knowledgeBaseId={KB_ID} offline={false} wide />,
  );
}

/** 用于构造最小修订摘要条目。 */
function revisionItem(revisionNumber: number): DocumentRevisionListItem {
  return {
    createdAt: '2026-08-17T07:00:00.000Z',
    revisionNumber,
    snippet: '历史摘要',
    source: 'manual',
    title: '历史标题',
  };
}

/** 用于构造最小修订全文投影。 */
function revisionDetail(): DocumentRevisionDetail {
  return {
    contentJson: { content: [], type: 'doc' },
    createdAt: '2026-08-17T07:00:00.000Z',
    plainText: '历史全文',
    revisionNumber: 2,
    schemaVersion: 1,
    snippet: '历史摘要',
    source: 'manual',
    title: '历史标题',
  };
}

/** 用于以受检类型读取全部 Fetch 调用记录。 */
function recordedCalls(): [RequestInfo | URL, RequestInit | undefined][] {
  return fetchMock.mock.calls as [RequestInfo | URL, RequestInit | undefined][];
}

/** 用于统计提交到修订端点的 POST 请求数。 */
function revisionPostCount(): number {
  return recordedCalls().filter(
    ([url, init]) => toUrl(url).pathname.endsWith('/revisions') && init?.method === 'POST',
  ).length;
}

/** 用于把 Fetch 输入收敛为可解析的 URL 对象。 */
function toUrl(input: RequestInfo | URL): URL {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return new URL(raw, 'http://localhost');
}

/** 用于判定一次调用是否指向正文保存端点的 PATCH。 */
function isContentPatch(call: [RequestInfo | URL, RequestInit | undefined]): boolean {
  return toUrl(call[0]).pathname.endsWith('/content') && call[1]?.method === 'PATCH';
}

/** 用于冲洗微任务队列让桩响应落地。 */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

/** 用于读取第 N 次提交的请求体。 */
function requestBody(call: number): Record<string, unknown> {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  fetchMock.mockReset();
});

test('标题与正文变更聚合为一次提交并在成功后显示已保存', async () => {
  fetchMock.mockResolvedValueOnce(jsonResponse(contentDetail({ version: 2 })));
  mountWorkbench();
  const title = screen.getByLabelText('文档标题');
  act(() => {
    fireEvent.change(title, { target: { value: '新标题' } });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1200);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(requestBody(0).title).toBe('新标题');
  expect(screen.getByText('已保存')).toBeVisible();
});

test('版本冲突后编辑器只读、工具栏禁用并展示服务端时间', async () => {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      return Promise.resolve(
        jsonResponse(
          { code: 'VERSION_CONFLICT', message: '资源已被其他操作更新。', requestId: 'r-1' },
          409,
        ),
      );
    }
    return Promise.resolve(jsonResponse(contentDetail({ version: 3, title: '服务端标题' })));
  });
  mountWorkbench();
  act(() => {
    fireEvent.change(screen.getByLabelText('文档标题'), { target: { value: '本地标题' } });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1200);
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
  expect(screen.getByText('版本冲突')).toBeVisible();
  expect(screen.getByText(/2026年8月17日/)).toBeVisible();
  const body = screen.getByRole('textbox', { name: '文档正文' });
  expect(body).toHaveAttribute('contenteditable', 'false');
  expect(body).toHaveAttribute('aria-readonly', 'true');
  expect(screen.getByRole('button', { name: '粗体' })).toHaveAttribute('aria-disabled', 'true');
});

test('冲突后重载文档以服务端内容重建会话', async () => {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      return Promise.resolve(jsonResponse({ code: 'VERSION_CONFLICT', message: '冲突' }, 409));
    }
    return Promise.resolve(jsonResponse(contentDetail({ version: 4, title: '重载后的标题' })));
  });
  mountWorkbench();
  act(() => {
    fireEvent.change(screen.getByLabelText('文档标题'), { target: { value: '本地' } });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1200);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '重载文档' }));
    await Promise.resolve();
  });
  expect(screen.getByLabelText('文档标题')).toHaveValue('重载后的标题');
  expect(screen.queryByText('版本冲突')).not.toBeInTheDocument();
});

test('冲突后可复制本地未落库内容', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      return Promise.resolve(jsonResponse({ code: 'VERSION_CONFLICT', message: '冲突' }, 409));
    }
    return Promise.resolve(jsonResponse(contentDetail()));
  });
  mountWorkbench();
  act(() => {
    fireEvent.change(screen.getByLabelText('文档标题'), { target: { value: '冲突标题' } });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1200);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '复制本地内容' }));
    await Promise.resolve();
  });
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining('冲突标题'));
  expect(screen.getByText('已复制到剪贴板')).toBeVisible();
});

test('冲突后间隔与卸载都不再为被放弃的本地内容创建修订', async () => {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      return Promise.resolve(jsonResponse({ code: 'VERSION_CONFLICT', message: '冲突' }, 409));
    }
    return Promise.resolve(jsonResponse(contentDetail()));
  });
  const { unmount } = mountWorkbench();
  act(() => {
    fireEvent.change(screen.getByLabelText('文档标题'), { target: { value: '被放弃的标题' } });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1200);
    await flushMicrotasks();
  });
  expect(screen.getByText('版本冲突')).toBeVisible();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(REVISION_INTERVAL_MS + 1000);
    await flushMicrotasks();
  });
  unmount();
  expect(revisionPostCount()).toBe(0);
});

test('上传占位未完成时提交的保存内容剔除占位节点', async () => {
  fetchMock.mockImplementation((input: RequestInfo | URL) => {
    if (toUrl(input).pathname.includes('/attachments/uploads')) {
      return new Promise<Response>(() => undefined);
    }
    return Promise.resolve(jsonResponse(contentDetail({ version: 2 })));
  });
  const { container } = mountWorkbench();
  await act(async () => {
    await startPendingImageUpload(container);
  });
  act(() => {
    fireEvent.change(screen.getByLabelText('文档标题'), { target: { value: '占位标题' } });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1200);
    await flushMicrotasks();
  });
  const calls = recordedCalls();
  const patchCalls = calls.filter(isContentPatch);
  expect(patchCalls).toHaveLength(1);
  assertBodyHasNoAttachmentPlaceholders(requestBody(calls.indexOf(patchCalls[0]!)));
});

/** 用于经隐藏文件选择器与确认对话框发起一次不落地的图片上传。 */
async function startPendingImageUpload(container: HTMLElement): Promise<void> {
  const picker = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File([new Uint8Array([1, 2, 3])], '图.png', { type: 'image/png' });
  fireEvent.change(picker, { target: { files: [file] } });
  await flushMicrotasks();
  fireEvent.click(screen.getByRole('button', { name: '确认上传' }));
  await flushMicrotasks();
}

/** 用于断言保存请求体的正文不含附件占位且块 id 保持 UUID 形态。 */
function assertBodyHasNoAttachmentPlaceholders(body: Record<string, unknown>): void {
  const doc = body.contentJson as {
    content?: { attrs?: { blockId?: string }; type: string }[];
  };
  const types = doc.content?.map((node) => node.type) ?? [];
  expect(types.every((type) => type !== 'image' && type !== 'attachment')).toBe(true);
  expect(types).toContain('paragraph');
  for (const node of doc.content ?? []) {
    expect(node.attrs?.blockId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  }
}

test('恢复后新会话以恢复结果版本为保存基线', async () => {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = toUrl(input);
    if (url.pathname.includes('/revisions/2/restore')) {
      return Promise.resolve(jsonResponse(contentDetail({ version: 5, title: '恢复后标题' })));
    }
    if (url.pathname.endsWith('/revisions/2')) {
      return Promise.resolve(jsonResponse(revisionDetail()));
    }
    if (url.pathname.endsWith('/revisions')) {
      return Promise.resolve(jsonResponse({ items: [revisionItem(2)], nextCursor: null }));
    }
    if (init?.method === 'PATCH') {
      return Promise.resolve(jsonResponse(contentDetail({ version: 6 })));
    }
    return Promise.resolve(jsonResponse(contentDetail({ version: 5 })));
  });
  mountWideWorkbench();
  await act(async () => {
    await flushMicrotasks();
  });
  await act(async () => {
    fireEvent.click(screen.getByText('#2'));
    await flushMicrotasks();
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '恢复此版本' }));
    await flushMicrotasks();
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '确认恢复' }));
    await flushMicrotasks();
  });
  expect(screen.getByLabelText('文档标题')).toHaveValue('恢复后标题');
  act(() => {
    fireEvent.change(screen.getByLabelText('文档标题'), { target: { value: '恢复后再编辑' } });
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1200);
    await flushMicrotasks();
  });
  assertPostRestorePatchesUseRestoredBaseline();
});

/** 用于断言恢复之后的全部保存请求都以恢复结果版本为基线。 */
function assertPostRestorePatchesUseRestoredBaseline(): void {
  const calls = recordedCalls();
  const restoreIndex = calls.findIndex(([url]) => toUrl(url).pathname.includes('/restore'));
  const postRestorePatches = calls
    .map((call, index) => ({ call, index }))
    .filter(({ call, index }) => index > restoreIndex && isContentPatch(call));
  expect(postRestorePatches.length).toBeGreaterThanOrEqual(1);
  for (const { index } of postRestorePatches) {
    expect(requestBody(index).version).toBe(5);
  }
  expect(requestBody(postRestorePatches.at(-1)!.index).title).toBe('恢复后再编辑');
}
