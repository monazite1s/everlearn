/** @fileoverview 验证 compose 会话渲染、确认卡决议、消息发送与轮询清理。 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { ComposePage } from './compose-page';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** 用于构造最小 Fetch JSON 响应。 */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    /** 用于返回无需传输解析的确定响应载荷。 */
    json: () => Promise.resolve(body),
    status,
  } as Response;
}

/** 用于构造消息最小载荷。 */
function message(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    card: null,
    createdAt: '2026-09-01T08:00:00.000Z',
    id: 'msg-1',
    role: 'agent',
    text: '一条回复',
    ...overrides,
  };
}

/** 用于构造会话快照最小载荷。 */
function snapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    chapters: [],
    hasEarlierMessages: false,
    knowledgeBase: { id: 'kb-1', kind: 'tutorial' },
    messages: [message()],
    stage: null,
    status: 'awaiting_outline',
    tutorialId: 'tut-1',
    topic: 'React 性能优化',
    ...overrides,
  };
}

/** 用于安装按地址路由的 fetch 桩。 */
function stubFetch(
  payload: Record<string, unknown>,
  handlers: Record<string, (init?: RequestInit) => Response> = {},
) {
  return vi.fn(
    /** 用于返回按地址路由后的确定响应。 */
    (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      for (const [pattern, handler] of Object.entries(handlers)) {
        if (url.includes(pattern)) return Promise.resolve(handler(init));
      }
      return Promise.resolve(jsonResponse(payload));
    },
  );
}

/** 用于渲染 compose 页并安装 fetch 桩。 */
function renderCompose(
  payload: Record<string, unknown>,
  handlers: Parameters<typeof stubFetch>[1] = {},
) {
  const fetchMock = stubFetch(payload, handlers);
  vi.stubGlobal('fetch', fetchMock);
  render(<ComposePage tutorialId="tut-1" />);
  return fetchMock;
}

/** 用于等待快照消息先渲染出来。 */
async function ready() {
  await screen.findByText('一条回复');
}

/** 用于验证快照渲染消息流与退出创作入口。 */
test('渲染会话消息流与返回阅读入口', async () => {
  renderCompose(snapshot());
  await ready();
  expect(screen.getByRole('link', { name: /退出创作，回阅读/ })).toHaveAttribute(
    'href',
    '/tutorials/tut-1',
  );
});

/** 用于验证范围闸门确认卡接受调用 confirm-scope 端点。 */
test('范围闸门接受调用确认范围端点', async () => {
  const fetchMock = renderCompose(
    snapshot({
      messages: [
        message({
          card: {
            body: '确认后将固化研究范围并发起研究。',
            gate: 'scope',
            state: 'pending',
            title: '开始研究',
            variant: 'gate',
          },
          id: 'msg-gate',
        }),
      ],
    }),
    {
      /** 用于返回确认范围成功响应。 */
      '/confirm-scope': () => jsonResponse({ ok: true }),
    },
  );
  await ready();
  fireEvent.click(screen.getByRole('button', { name: '接受' }));
  await waitFor(() =>
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/confirm-scope'))).toBe(
      true,
    ),
  );
});

/** 用于构造 pending 提案消息载荷。 */
function proposalMessage(id: string, proposalId: string, title: string, body: string) {
  return message({
    card: { body, proposalId, state: 'pending', title, variant: 'proposal' },
    id,
    text: '',
  });
}

/** 用于验证提案接受与拒绝分别调用对应决议端点。 */
test('提案接受与拒绝调用对应决议端点', async () => {
  const fetchMock = renderCompose(
    snapshot({
      messages: [
        proposalMessage('msg-prop-1', 'prop-1', '大纲修订提案', '建议增加一章讲解工具链。'),
        proposalMessage('msg-prop-3', 'prop-3', '章节选题提案', '建议调整第三章的选题方向。'),
      ],
    }),
    {
      /** 用于返回提案接受成功响应。 */
      '/proposals/prop-1/accept': () => jsonResponse({ ok: true }),
      /** 用于返回提案拒绝成功响应。 */
      '/proposals/prop-3/reject': () => jsonResponse({ ok: true }),
    },
  );
  await screen.findByText('大纲修订提案');
  const first = screen.getByText('大纲修订提案').closest('div[data-slot="card"]');
  fireEvent.click(within(first as HTMLElement).getByRole('button', { name: '接受' }));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('/proposals/prop-1/accept')),
    ).toBe(true),
  );
  const second = screen.getByText('章节选题提案').closest('div[data-slot="card"]');
  fireEvent.click(within(second as HTMLElement).getByRole('button', { name: '拒绝' }));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('/proposals/prop-3/reject')),
    ).toBe(true),
  );
});

/** 用于验证已决议卡展示回执且不再渲染操作。 */
test('已决议提案展示回执状态', async () => {
  renderCompose(
    snapshot({
      messages: [
        message({
          card: {
            body: '建议增加一章讲解工具链。',
            proposalId: 'prop-1',
            state: 'rejected',
            title: '大纲修订提案',
            variant: 'proposal',
          },
          id: 'msg-prop',
        }),
      ],
    }),
  );
  await ready();
  expect(screen.getByText('已拒绝')).toBeInTheDocument();
  expect(screen.getByText('未产生任何变更。')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '接受' })).not.toBeInTheDocument();
});

/** 用于验证用户编辑章节的差异卡展示差异并经接受落库。 */
test('差异确认卡展示前后内容并接受差异', async () => {
  const fetchMock = renderCompose(
    snapshot({
      messages: [
        message({
          card: {
            body: '本章已被手动编辑，Agent 改写需要你确认。',
            diff: {
              generationId: 'gen-9',
              sections: [{ after: '新版本内容', before: '原版本内容', name: '概述' }],
            },
            proposalId: 'prop-2',
            state: 'pending',
            title: '第二章改写差异',
            variant: 'diff',
          },
          id: 'msg-diff',
        }),
      ],
    }),
    {
      /** 用于返回差异接受成功响应。 */
      '/generations/gen-9/accept': () => jsonResponse({ ok: true }),
    },
  );
  await ready();
  expect(screen.getByText('概述')).toBeInTheDocument();
  expect(screen.getByText('原文：原版本内容')).toBeInTheDocument();
  expect(screen.getByText('改为：新版本内容')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '接受差异' }));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some((call) => String(call[0]).includes('/generations/gen-9/accept')),
    ).toBe(true),
  );
});

/** 用于验证发送消息携带幂等键且成功后刷新会话。 */
test('发送消息携带幂等键并刷新会话', async () => {
  const fetchMock = renderCompose(snapshot(), {
    /** 用于断言幂等键并返回 200 响应。 */
    '/compose/messages': (init) => {
      const key = (init?.headers as Record<string, string> | undefined)?.['idempotency-key'];
      expect(typeof key).toBe('string');
      return jsonResponse({ ok: true }, 200);
    },
  });
  await ready();
  fireEvent.change(screen.getByLabelText('输入消息'), { target: { value: '加一章性能调优' } });
  fireEvent.click(screen.getByRole('button', { name: '发送' }));
  await waitFor(() =>
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('/compose/messages'))).toBe(
      true,
    ),
  );
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/tutorials/tut-1/compose'))
        .length,
    ).toBeGreaterThan(1),
  );
});

/** 用于验证发送失败保留输入并展示重试入口。 */
test('发送失败保留输入并提供重试', async () => {
  renderCompose(snapshot(), {
    /** 用于返回发送失败响应。 */
    '/compose/messages': () =>
      jsonResponse({ code: 'VALIDATION_FAILED', message: '内容不合规' }, 400),
  });
  await ready();
  const form = screen.getByRole('form', { name: '发送消息' });
  const input = within(form).getByLabelText('输入消息');
  fireEvent.change(input, { target: { value: '加一章性能调优' } });
  fireEvent.click(within(form).getByRole('button', { name: '发送' }));
  const alert = await within(form).findByRole('alert');
  expect(within(alert).getByText(/内容不合规/)).toBeInTheDocument();
  expect(input).toHaveValue('加一章性能调优');
  expect(within(alert).getByRole('button', { name: '重试发送' })).toBeInTheDocument();
});

/** 用于验证生成阶段禁用输入避免并发消息。 */
test('生成阶段禁用消息输入', async () => {
  renderCompose(
    snapshot({
      stage: { completed: 3, phase: 'generating', sourcesGathered: null, total: 12 },
      status: 'generating',
    }),
  );
  await ready();
  expect(screen.getByText('章节生成中 3/12')).toBeInTheDocument();
  expect(screen.getByLabelText('输入消息')).toBeDisabled();
  expect(screen.getByRole('button', { name: '发送' })).toBeDisabled();
});

/** 用于验证章节生成进度在预览区随真实计数宣告。 */
test('预览区渲染章节树与研究计数', async () => {
  renderCompose(
    snapshot({
      chapters: [
        {
          attempt: 1,
          dependsOn: [],
          documentId: 'doc-1',
          errorCode: null,
          id: 'ch-1',
          nodeKey: 'ch-1',
          status: 'completed',
          summary: '',
          title: '第一章',
        },
      ],
      stage: { completed: null, phase: 'researching', sourcesGathered: 8, total: null },
      status: 'researching',
    }),
  );
  await ready();
  expect(screen.getByText('研究中，已获取来源 8')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '第一章' })).toHaveAttribute(
    'href',
    '/knowledge/kb-1/documents/doc-1',
  );
});

/** 用于验证轮询按间隔刷新并在卸载后停止。 */
test('轮询刷新快照且卸载后停止', async () => {
  vi.useFakeTimers();
  const fetchMock = renderCompose(snapshot());
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(screen.getByText('一条回复')).toBeInTheDocument();
  const callsBefore = fetchMock.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(fetchMock.mock.calls.length).toBe(callsBefore + 1);
  cleanup();
  const callsAfterUnmount = fetchMock.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(fetchMock.mock.calls.length).toBe(callsAfterUnmount);
});

/** 用于验证快照读取失败展示就地重试。 */
test('快照读取失败展示重试入口', async () => {
  renderCompose(
    {},
    {
      /** 用于返回确定的测试响应。 */
      '/tutorials/tut-1/compose': () =>
        jsonResponse({ code: 'INTERNAL_ERROR', message: '服务内部错误' }, 500),
    },
  );
  expect(await screen.findByText('无法读取创作会话')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '重新读取' })).toBeInTheDocument();
});
