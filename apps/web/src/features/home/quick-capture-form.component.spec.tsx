/** @fileoverview 验证首页快速记录条的判别、反馈、禁用与失败保留行为。 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { QuickCaptureForm } from './quick-capture-form';

/** 用于返回组件适配器所需的最小 Fetch 响应。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于返回无需传输解析的确定响应载荷。 */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** 用于渲染快速记录条并返回输入元素。 */
async function renderForm(offline = false): Promise<HTMLElement> {
  render(<QuickCaptureForm offline={offline} />);
  return screen.findByRole('textbox', { name: '内容' });
}

/** 用于填写单行记录输入。 */
function fillContent(input: HTMLElement, value: string): void {
  fireEvent.change(input, { target: { value } });
}

/** 用于读取唯一一次创建请求的初始化参数。 */
function createdRequest(fetchMock: ReturnType<typeof vi.fn>): RequestInit | undefined {
  return fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
}

/** 用于在每个场景后恢复 DOM 与请求状态。 */
function resetScenario(): void {
  cleanup();
  vi.unstubAllGlobals();
}

afterEach(resetScenario);

/** 用于验证纯文本按 trim 后的文本载荷提交。 */
async function recordsTrimmedTextPayload(): Promise<void> {
  const fetchMock = vi.fn().mockResolvedValue(
    jsonResponse(
      {
        content: '笔记',
        createdAt: '2026-08-17T08:00:00.000Z',
        id: 'a'.repeat(32),
        kind: 'text',
      },
      201,
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  const input = await renderForm();

  fillContent(input, '  读一篇论文的摘要 ');
  fireEvent.click(screen.getByRole('button', { name: '记录' }));

  await screen.findByText('已记录到 Inbox。');
  expect(createdRequest(fetchMock)?.body).toBe(JSON.stringify({ text: '读一篇论文的摘要' }));
  fillContent(input, '下一条记录');
  expect(screen.queryByText('已记录到 Inbox。')).not.toBeInTheDocument();
}

/** 用于验证单行 http 链接按 URL 载荷提交。 */
async function recordsSingleLineUrlPayload(): Promise<void> {
  const fetchMock = vi
    .fn()
    .mockResolvedValue(
      jsonResponse(
        { content: 'u', createdAt: '2026-08-17T08:00:00.000Z', id: 'b'.repeat(32), kind: 'url' },
        201,
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
  const input = await renderForm();

  fillContent(input, 'https://example.com/article?id=1');
  fireEvent.click(screen.getByRole('button', { name: '记录' }));

  await screen.findByText('已记录到 Inbox。');
  expect(createdRequest(fetchMock)?.body).toBe(
    JSON.stringify({ url: 'https://example.com/article?id=1' }),
  );
}

/** 用于验证成功后清空输入并提供 Inbox 核对链接。 */
async function clearsInputAndConfirmsWithReviewLink(): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          { content: 'u', createdAt: '2026-08-17T08:00:00.000Z', id: 'c'.repeat(32), kind: 'url' },
          201,
        ),
      ),
  );
  const input = await renderForm();

  fillContent(input, 'https://example.com/a');
  fireEvent.click(screen.getByRole('button', { name: '记录' }));

  expect(await screen.findByText('已记录到 Inbox。')).toBeVisible();
  expect(screen.getByRole('link', { name: '打开 Inbox' })).toHaveAttribute(
    'href',
    '/knowledge/inbox',
  );
  expect(input).toHaveValue('');
}

/** 用于验证已知失败保留输入并展示原因。 */
async function keepsInputAndShowsReasonOnFailure(): Promise<void> {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(jsonResponse({ code: 'INTERNAL_ERROR', message: '服务暂不可用。' }, 500)),
  );
  const input = await renderForm();

  fillContent(input, '待整理的想法');
  fireEvent.click(screen.getByRole('button', { name: '记录' }));

  expect(await screen.findByText('记录失败：服务暂不可用。')).toBeVisible();
  expect(input).toHaveValue('待整理的想法');
}

/** 用于验证结果未知时提示到 Inbox 核对。 */
async function offersReviewLinkOnUnknownOutcome(): Promise<void> {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
  const input = await renderForm();

  fillContent(input, '待整理的想法');
  fireEvent.click(screen.getByRole('button', { name: '记录' }));

  expect(await screen.findByRole('link', { name: '打开 Inbox 核对' })).toHaveAttribute(
    'href',
    '/knowledge/inbox',
  );
  expect(input).toHaveValue('待整理的想法');
}

/** 用于验证请求进行中输入与提交均被禁用。 */
async function disablesControlsWhileSubmitting(): Promise<void> {
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise(() => undefined)));
  const input = await renderForm();

  fillContent(input, '提交中的内容');
  const submit = screen.getByRole('button', { name: '记录' });
  fireEvent.click(submit);

  expect(input).toBeDisabled();
  expect(submit).toBeDisabled();
}

/** 用于验证离线时输入与提交均被禁用。 */
async function disablesControlsWhenOffline(): Promise<void> {
  const input = await renderForm(true);

  expect(input).toBeDisabled();
  expect(screen.getByRole('button', { name: '记录' })).toBeDisabled();
}

/** 用于验证空输入与非法链接式输入不允许提交。 */
async function blocksInvalidSubmissions(): Promise<void> {
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const input = await renderForm();

  expect(screen.getByRole('button', { name: '记录' })).toBeDisabled();
  fillContent(input, 'https://example.com 阅读备注');
  expect(
    await screen.findByText(
      '以 http(s):// 开头的单行内容将按链接记录：请补全链接，或另起一行按文本记录。',
    ),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: '记录' })).toBeDisabled();
  expect(fetchMock).not.toHaveBeenCalled();
}

test('records trimmed text payload', recordsTrimmedTextPayload);
test('records single-line url payload', recordsSingleLineUrlPayload);
test('clears input and confirms with review link', clearsInputAndConfirmsWithReviewLink);
test('keeps input and shows reason on failure', keepsInputAndShowsReasonOnFailure);
test('offers review link on unknown outcome', offersReviewLinkOnUnknownOutcome);
test('disables controls while submitting', disablesControlsWhileSubmitting);
test('disables controls when offline', disablesControlsWhenOffline);
test('blocks invalid submissions', blocksInvalidSubmissions);
