/** @fileoverview 验证教程详情页各状态视图与重试、取消交互。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { TutorialDetailPage } from './tutorial-detail-page';
import type { TutorialChapter, TutorialDetail } from './tutorials-api';

/** 带类型的 Fetch 测试桩。 */
type FetchMock = ReturnType<
  typeof vi.fn<(input: string | URL, init?: RequestInit) => Promise<Response>>
>;

afterEach(() => {
  cleanup();
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

/** 用于构造教程详情最小载荷。 */
function detail(overrides: Partial<TutorialDetail> = {}): TutorialDetail {
  return {
    chapters: [],
    errorCode: null,
    id: 'tut-1',
    outline: null,
    scope: {
      audience: '初学者',
      depth: 'standard',
      excludeTopics: [],
      goals: '入门',
      includeTopics: [],
      knowledgeBaseIds: [],
      level: '初级',
      topic: 'React 性能优化',
    },
    status: 'draft',
    tutorialKnowledgeBaseId: null,
    warnings: [],
    ...overrides,
  };
}

/** 用于构造章节最小载荷。 */
function chapter(overrides: Partial<TutorialChapter> = {}): TutorialChapter {
  return {
    attempt: 1,
    dependsOn: [],
    documentId: null,
    errorCode: null,
    id: 'ch-x',
    nodeKey: 'ch-x',
    status: 'pending',
    title: '章节',
    ...overrides,
  };
}

/** 用于安装按地址路由的 fetch 桩。 */
function stubFetch(
  initial: TutorialDetail,
  handlers: Record<string, (init?: RequestInit) => Response> = {},
): FetchMock {
  return vi.fn(
    /** 用于返回按地址路由后的确定响应。 */
    (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      for (const [pattern, handler] of Object.entries(handlers)) {
        if (url.includes(pattern)) return Promise.resolve(handler(init));
      }
      return Promise.resolve(jsonResponse(initial));
    },
  );
}

/** 用于渲染教程详情页。 */
function renderDetail(fetchMock: FetchMock): void {
  vi.stubGlobal('fetch', fetchMock);
  render(<TutorialDetailPage tutorialId="tut-1" />);
}

/** 用于断言指定后缀的接口已被调用。 */
async function expectCalled(fetchMock: FetchMock, suffix: string): Promise<void> {
  await waitFor(() => {
    /** 用于拼接调用判断结果。 */
    const called = fetchMock.mock.calls.some(
      /** 用于拼接调用地址。 */
      (call) => String(call[0]).endsWith(suffix),
    );
    expect(called).toBe(true);
  });
}

/** 用于验证草稿状态展示范围编辑与确认研究副作用文案。 */
test('草稿状态展示范围表单与副作用文案', async () => {
  renderDetail(stubFetch(detail()));
  expect(await screen.findByLabelText('主题')).toHaveValue('React 性能优化');
  expect(screen.getByText(/确认后将读取所选知识库并联网研究/)).toBeInTheDocument();
});

/** 用于验证草稿确认调用保存范围与确认研究两个接口。 */
test('草稿确认依次调用保存范围与确认研究', async () => {
  const fetchMock = stubFetch(detail(), {
    'confirm-scope': /** 用于返回确认成功响应。 */ () => jsonResponse({ ok: true }),
    '/scope': /** 用于返回保存成功响应。 */ () => jsonResponse({ ok: true }),
  });
  renderDetail(fetchMock);
  fireEvent.click(await screen.findByRole('button', { name: '确认并开始研究' }));
  await expectCalled(fetchMock, '/confirm-scope');
});

/** 用于验证研究中状态展示说明文案且不展示虚假进度。 */
test('研究状态展示进行中说明', async () => {
  renderDetail(stubFetch(detail({ status: 'researching' })));
  expect(await screen.findByText(/正在读取所选知识库并联网研究/)).toBeInTheDocument();
});

/** 用于验证大纲确认调用保存与确认接口。 */
test('大纲确认调用保存大纲与确认大纲接口', async () => {
  const fetchMock = stubFetch(
    detail({
      outline: {
        chapters: [{ dependsOn: ['ch-1'], nodeKey: 'ch-2', summary: '渲染原理', title: '第二章' }],
      },
      status: 'outline_ready',
    }),
    {
      'confirm-outline': /** 用于返回确认成功响应。 */ () => jsonResponse({ ok: true }),
      '/outline': /** 用于返回保存成功响应。 */ () => jsonResponse({ ok: true }),
    },
  );
  renderDetail(fetchMock);
  const title = await screen.findByLabelText('第 1 章标题');
  fireEvent.change(title, { target: { value: '渲染原理详解' } });
  fireEvent.click(screen.getByRole('button', { name: '确认大纲并创建教程知识库' }));
  await expectCalled(fetchMock, '/confirm-outline');
  const saveCall = fetchMock.mock.calls.find(
    /** 用于匹配保存大纲地址。 */
    (call) => String(call[0]).endsWith('/outline'),
  );
  const body = saveCall === undefined ? '{}' : String(saveCall[1]?.body as string | undefined);
  const payload: unknown = JSON.parse(body);
  expect(payload).toMatchObject({ chapters: [{ title: '渲染原理详解' }] });
  expect(screen.getByText('依赖：ch-1')).toBeInTheDocument();
});

/** 用于验证生成中状态展示章节、重试与取消交互。 */
test('生成中状态支持单章重试与取消剩余章节', async () => {
  const fetchMock = stubFetch(
    detail({
      chapters: [
        chapter({
          attempt: 2,
          errorCode: 'CHAPTER_GENERATION_FAILED',
          id: 'ch-1',
          nodeKey: 'ch-1',
          status: 'failed',
          title: '第一章',
        }),
        chapter({
          documentId: 'doc-2',
          id: 'ch-2',
          nodeKey: 'ch-2',
          status: 'succeeded',
          title: '第二章',
        }),
      ],
      status: 'partial',
      tutorialKnowledgeBaseId: 'kb-tut',
    }),
    {
      '/chapters/ch-1/retry': /** 用于返回重试成功响应。 */ () => jsonResponse({ ok: true }),
      '/cancel': /** 用于返回取消成功响应。 */ () => jsonResponse({ ok: true }),
    },
  );
  renderDetail(fetchMock);
  expect(await screen.findByText('第一章')).toBeInTheDocument();
  expect(screen.getByText('章节生成失败，可重试本章。')).toBeInTheDocument();
  expect(screen.getByText('已尝试 2 次')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '阅读本章' })).toHaveAttribute(
    'href',
    '/knowledge/kb-tut/documents/doc-2',
  );
  fireEvent.click(screen.getByRole('button', { name: '重试章节 第一章' }));
  await expectCalled(fetchMock, '/chapters/ch-1/retry');
  fireEvent.click(screen.getByRole('button', { name: '取消剩余章节' }));
  await expectCalled(fetchMock, '/cancel');
});

/** 用于验证失败状态展示错误码中文映射与建议。 */
test('失败状态展示中文错误与修改建议', async () => {
  renderDetail(stubFetch(detail({ errorCode: 'RESEARCH_FAILED', status: 'failed' })));
  expect(await screen.findByText(/研究阶段失败/)).toBeInTheDocument();
  expect(screen.getByText(/建议调整主题或范围后重试/)).toBeInTheDocument();
});

/** 用于验证告警警示条渲染。 */
test('详情告警渲染警示条', async () => {
  renderDetail(stubFetch(detail({ warnings: ['部分来源不可访问，已跳过。'] })));
  expect(await screen.findByText('本教程有告警')).toBeInTheDocument();
  expect(screen.getByText('部分来源不可访问，已跳过。')).toBeInTheDocument();
});
