/** @fileoverview 验证 AI 生成页签的流式中、接受、放弃与错误状态。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { AiDraftTab } from './ai-draft-tab';

const DOC_ID = '11111111-1111-4111-8111-111111111111';
const fetchMock = vi.fn();
const encoder = new TextEncoder();

/** 用于把数据帧包装为 SSE 文本。 */
function frame(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/** 用于构造 SSE 响应桩；keepOpen 为真时流保持挂起模拟生成中。 */
function sseResponse(frames: string[], keepOpen = false): Response {
  let pulled = false;
  return {
    body: new ReadableStream<Uint8Array>({
      // eslint-disable-next-line jsdoc/require-jsdoc -- 测试桩的流拉取回调，非产品代码
      pull(controller) {
        if (pulled) return;
        pulled = true;
        for (const item of frames) controller.enqueue(encoder.encode(item));
        if (!keepOpen) controller.close();
      },
    }),
    ok: true,
    status: 200,
  } as unknown as Response;
}

/** 用于输入指令并点击生成。 */
function startGenerate(): void {
  fireEvent.change(screen.getByLabelText('生成指令'), {
    target: { value: '写一段总结' },
  });
  fireEvent.click(screen.getByRole('button', { name: '生成草稿' }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

test('流式中展示增量预览与停止按钮', async () => {
  vi.stubGlobal(
    'fetch',
    fetchMock.mockResolvedValue(
      sseResponse([frame({ delta: '第一段', done: false, seq: 0 })], true),
    ),
  );
  render(<AiDraftTab documentId={DOC_ID} onAccept={vi.fn()} />);
  startGenerate();
  await waitFor(() => expect(screen.getByText('第一段')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: '停止生成' })).toBeInTheDocument();
});

test('接受草稿把 Markdown 转为正文 JSON 提交', async () => {
  vi.stubGlobal(
    'fetch',
    fetchMock.mockResolvedValue(
      sseResponse([
        frame({ delta: '# 标题', done: false, seq: 0 }),
        frame({ delta: '', done: true, seq: 1 }),
      ]),
    ),
  );
  const onAccept = vi.fn();
  render(<AiDraftTab documentId={DOC_ID} onAccept={onAccept} />);
  startGenerate();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: '接受并替换正文' })).toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole('button', { name: '接受并替换正文' }));
  expect(onAccept).toHaveBeenCalledWith(
    expect.objectContaining({
      content: [
        expect.objectContaining({
          attrs: { level: 1 },
          content: [expect.objectContaining({ text: '标题', type: 'text' })],
          type: 'heading',
        }),
      ],
      type: 'doc',
    }),
  );
});

test('放弃草稿清空预览且零写入', async () => {
  vi.stubGlobal(
    'fetch',
    fetchMock.mockResolvedValue(
      sseResponse([
        frame({ delta: '草稿', done: false, seq: 0 }),
        frame({ delta: '', done: true, seq: 1 }),
      ]),
    ),
  );
  const onAccept = vi.fn();
  render(<AiDraftTab documentId={DOC_ID} onAccept={onAccept} />);
  startGenerate();
  await waitFor(() => expect(screen.getByRole('button', { name: '放弃' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: '放弃' }));
  expect(screen.queryByText('草稿')).not.toBeInTheDocument();
  expect(onAccept).not.toHaveBeenCalled();
});

test('完成帧携带错误码时展示映射文案', async () => {
  vi.stubGlobal(
    'fetch',
    fetchMock.mockResolvedValue(
      sseResponse([frame({ delta: '', done: true, error: 'LLM_NOT_CONFIGURED', seq: 0 })]),
    ),
  );
  render(<AiDraftTab documentId={DOC_ID} onAccept={vi.fn()} />);
  startGenerate();
  await waitFor(() =>
    expect(screen.getByRole('alert')).toHaveTextContent(
      '模型服务未配置，请联系管理员配置 LLM 后使用。',
    ),
  );
});
