/** @fileoverview 验证附件上传的确认、占位状态机、失败重试与移除行为。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DocumentContentDetail } from '@everlearn/contracts';
import { afterEach, expect, test, vi } from 'vitest';

import { EditorWorkbench } from './editor-workbench';

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const KB_ID = '22222222-2222-4222-8222-222222222222';
const ATTACHMENT_ID = '33333333-3333-4333-8333-333333333333';
const UPLOAD_ID = '44444444-4444-4444-8444-444444444444';
const fetchMock = vi.fn();

/** 用于构造最小内容投影。 */
function contentDetail(): DocumentContentDetail {
  return {
    childCount: 0,
    contentJson: { content: [{ type: 'paragraph' }], type: 'doc' },
    id: DOC_ID,
    knowledgeBaseId: KB_ID,
    parentId: null,
    schemaVersion: 1,
    title: '附件测试文档',
    updatedAt: '2026-08-17T08:00:00.000Z',
    version: 1,
  };
}

/** 用于把 Fetch 输入收敛为可解析的 URL 对象。 */
function toUrl(input: RequestInfo | URL): URL {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  return new URL(raw, 'http://localhost');
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

/** 用于构造两段式上传的内存服务：confirm 失败次数后转为成功。 */
function createUploadServer(confirmFailures: number) {
  let confirmCalls = 0;
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = toUrl(input);
    if (url.pathname === '/api/v1/attachments/uploads' && init?.method === 'POST') {
      return Promise.resolve(
        jsonResponse(
          {
            expiresAt: '2026-08-17T09:00:00.000Z',
            headers: { 'Content-Type': 'text/plain' },
            id: UPLOAD_ID,
            method: 'PUT',
            uploadUrl: 'http://storage.local/put',
          },
          201,
        ),
      );
    }
    if (url.hostname === 'storage.local') return Promise.resolve(jsonResponse({}, 200));
    if (url.pathname.endsWith('/confirm')) {
      confirmCalls += 1;
      if (confirmCalls <= confirmFailures) {
        return Promise.resolve(
          jsonResponse({ code: 'HASH_MISMATCH', message: '哈希不一致。' }, 422),
        );
      }
      return Promise.resolve(jsonResponse(attachmentDetailBody(), 201));
    }
    return Promise.resolve(jsonResponse({ code: 'INTERNAL_ERROR', message: '不支持' }, 500));
  });
}

/** 用于返回确认成功的附件详情。 */
function attachmentDetailBody() {
  return {
    createdAt: '2026-08-17T08:00:00.000Z',
    fileName: '笔记.txt',
    id: ATTACHMENT_ID,
    kind: 'file',
    mimeType: 'text/plain',
    referenceCount: 0,
    sizeBytes: 5,
    status: 'pending',
    updatedAt: '2026-08-17T08:00:00.000Z',
  };
}

/** 用于挂载编辑会话并返回隐藏文件选择 input。 */
async function mountWithPicker(): Promise<HTMLInputElement> {
  const { container } = render(
    <EditorWorkbench
      initialDetail={contentDetail()}
      knowledgeBaseId={KB_ID}
      offline={false}
      wide={false}
    />,
  );
  await screen.findByRole('textbox', { name: '文档正文' });
  return container.querySelector<HTMLInputElement>('input[type=file]')!;
}

/** 用于模拟一次文件选择。 */
function chooseFile(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });
  fireEvent.change(input);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

test('选择文件先确认再上传并落为附件块', async () => {
  fetchMock.mockImplementation(createUploadServer(0));
  vi.stubGlobal('fetch', fetchMock);
  const input = await mountWithPicker();
  chooseFile(input, new File(['hello'], '笔记.txt', { type: 'text/plain' }));

  expect(await screen.findByRole('dialog', { name: '上传附件' })).toBeVisible();
  expect(screen.getByText('笔记.txt')).toBeVisible();
  expect(screen.getByText('5 B')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '确认上传' }));

  const download = await screen.findByRole('link', { name: '下载 笔记.txt' });
  expect(download).toHaveAttribute('href', `/api/v1/attachments/${ATTACHMENT_ID}/content`);
  expect(screen.queryByRole('status', { name: '正在上传附件' })).not.toBeInTheDocument();
});

test('确认失败保留失败占位并可重试成功', async () => {
  fetchMock.mockImplementation(createUploadServer(1));
  vi.stubGlobal('fetch', fetchMock);
  const input = await mountWithPicker();
  chooseFile(input, new File(['hello'], '笔记.txt', { type: 'text/plain' }));
  fireEvent.click(await screen.findByRole('button', { name: '确认上传' }));

  const failed = await screen.findByRole('alert');
  expect(failed).toHaveTextContent('笔记.txt上传失败');
  fireEvent.click(screen.getByRole('button', { name: '重试上传' }));
  await screen.findByRole('link', { name: '下载 笔记.txt' });
  expect(fetchMock.mock.calls.filter((call) => String(call[0]).includes('confirm'))).toHaveLength(
    2,
  );
});

test('失败占位可移除且不写入文档', async () => {
  fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = toUrl(input);
    if (url.pathname === '/api/v1/attachments/uploads' && init?.method === 'POST') {
      return Promise.resolve(
        jsonResponse({ code: 'SIZE_EXCEEDED', message: '文件超出上限。' }, 422),
      );
    }
    return Promise.resolve(jsonResponse({ code: 'INTERNAL_ERROR', message: '不支持' }, 500));
  });
  vi.stubGlobal('fetch', fetchMock);
  const input = await mountWithPicker();
  chooseFile(input, new File(['hello'], '笔记.txt', { type: 'text/plain' }));
  fireEvent.click(await screen.findByRole('button', { name: '确认上传' }));

  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: '移除占位' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

test('取消确认不上传且不留占位', async () => {
  vi.stubGlobal('fetch', fetchMock);
  const input = await mountWithPicker();
  chooseFile(input, new File(['hello'], '笔记.txt', { type: 'text/plain' }));
  fireEvent.click(await screen.findByRole('button', { name: '取消' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});
