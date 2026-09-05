/** @fileoverview 验证详情页三视图投影、?view 状态与章节操作交互。 */

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { TutorialDetailPage } from './tutorial-detail-page';

const routerReplace = vi.fn();
let currentQuery = '';

vi.mock('next/navigation', () => ({
  /** 用于提供视图切换与参数解析所需的最小路由接口。 */
  useRouter: () => ({ replace: routerReplace }),
  /** 用于返回按当前查询串解析的参数。 */
  useSearchParams: () => new URLSearchParams(currentQuery),
}));

beforeEach(() => {
  currentQuery = '';
});

afterEach(() => {
  cleanup();
  routerReplace.mockClear();
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

/** 用于构造章节最小载荷。 */
function chapter(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    attempt: 1,
    dependsOn: [],
    documentId: null,
    errorCode: null,
    id: 'ch-x',
    nodeKey: 'ch-x',
    status: 'placeholder',
    summary: '',
    title: '章节',
    ...overrides,
  };
}

/** 用于构造教程详情最小载荷。 */
function detailPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    chapters: [
      chapter({
        id: 'ch-1',
        nodeKey: 'ch-1',
        status: 'completed',
        documentId: 'doc-1',
        title: '第一章 基础',
      }),
      chapter({
        dependsOn: ['ch-1'],
        errorCode: 'CHAPTER_GENERATION_FAILED',
        id: 'ch-2',
        nodeKey: 'ch-2',
        status: 'failed',
        summary: '讲解渲染流程',
        title: '第二章 渲染',
      }),
    ],
    continueTo: { chapterTitle: '第一章 基础', documentId: 'doc-1', knowledgeBaseId: 'kb-1' },
    currentChapterId: 'ch-1',
    errorCode: null,
    id: 'tut-1',
    knowledgeBase: { id: 'kb-1', kind: 'tutorial' },
    stage: null,
    status: 'partial',
    topic: 'React 性能优化',
    warnings: [],
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

/** 用于渲染详情页并安装 fetch 桩。 */
function renderDetail(
  payload: Record<string, unknown>,
  handlers: Parameters<typeof stubFetch>[1] = {},
) {
  const fetchMock = stubFetch(payload, handlers);
  vi.stubGlobal('fetch', fetchMock);
  render(<TutorialDetailPage tutorialId="tut-1" />);
  return fetchMock;
}

/** 用于断言指定后缀的接口已被调用。 */
async function expectCalled(
  fetchMock: ReturnType<typeof stubFetch>,
  suffix: string,
): Promise<void> {
  await waitFor(() => {
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes(suffix))).toBe(true);
  });
}

/** 用于等待详情页章节在左栏与树视图中渲染完成。 */
async function ready() {
  await waitFor(() => expect(screen.getAllByText('第二章 渲染').length).toBeGreaterThan(0));
}

/** 用于验证树视图默认渲染章节、脊线当前位置与阅读链接。 */
test('树视图默认渲染章节与当前位置阅读链接', async () => {
  renderDetail(detailPayload());
  await ready();
  const current = screen.getByRole('link', { name: /第一章 基础/ });
  expect(current).toHaveAttribute('href', '/knowledge/kb-1/documents/doc-1');
  expect(current).toHaveAttribute('aria-current', 'page');
  expect(screen.getByText('依赖：第一章 基础')).toBeInTheDocument();
});

/** 用于验证 ?view=list 恢复列表视图并平铺同一章节数据。 */
test('列表视图平铺同一章节数据与依赖', async () => {
  currentQuery = 'view=list';
  renderDetail(detailPayload());
  const table = await screen.findByRole('table', { name: '章节列表' });
  expect(within(table).getByText('第二章 渲染')).toBeInTheDocument();
  expect(within(table).getAllByText('第一章 基础').length).toBe(2);
  expect(within(table).getByText('章节生成失败，可重试本章。')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: '列表' })).toHaveAttribute('aria-selected', 'true');
});

/** 用于验证 ?view=graph 恢复图视图并支持依赖信息的文字读取。 */
test('图视图渲染节点状态与可访问名称', async () => {
  currentQuery = 'view=graph';
  renderDetail(detailPayload());
  const graph = await screen.findByRole('region', { name: '章节依赖图' });
  expect(within(graph).getByRole('link', { name: /第一章 基础/ })).toBeInTheDocument();
  const failedNode = within(graph).getByRole('group', { name: /第二章 渲染，状态 失败/ });
  expect(within(failedNode).getByText('失败')).toBeInTheDocument();
  expect(within(graph).getByText('切换到列表视图')).toBeInTheDocument();
});

/** 用于验证键盘切换 Tabs 只 replace 查询参数保持状态在 URL。 */
test('键盘切换视图 Tabs 只 replace ?view=', async () => {
  renderDetail(detailPayload());
  await ready();
  fireEvent.keyDown(screen.getByRole('tab', { name: '图' }), { key: 'Enter' });
  await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/tutorials/tut-1?view=graph'));
});

/** 用于验证非法 view 参数被 replace 回默认树视图。 */
test('非法 view 参数被 replace 回默认', async () => {
  currentQuery = 'view=matrix';
  renderDetail(detailPayload());
  await ready();
  await waitFor(() => expect(routerReplace).toHaveBeenCalledWith('/tutorials/tut-1?view=tree'));
});

/** 用于验证失败章节单章重试调用章节重试端点。 */
test('失败章节提供单章重试', async () => {
  const fetchMock = renderDetail(detailPayload(), {
    /** 用于返回按当前查询串解析的参数。 */
    '/tutorial-chapters/ch-2/retry': () => jsonResponse({ ok: true }),
  });
  await ready();
  fireEvent.click(screen.getByRole('button', { name: '重试章节 第二章 渲染' }));
  await expectCalled(fetchMock, '/tutorial-chapters/ch-2/retry');
});

/** 用于验证未建库阶段引导进入创作而不是旧表单。 */
test('未建库草稿阶段展示创作引导', async () => {
  renderDetail(detailPayload({ chapters: [], status: 'draft_scope', knowledgeBase: null }));
  expect(await screen.findByText('教程还没有确认研究范围')).toBeInTheDocument();
  const entries = screen.getAllByRole('link', { name: '进入创作' });
  expect(entries.length).toBeGreaterThan(0);
  expect(entries[0]).toHaveAttribute('href', '/tutorials/tut-1/compose');
});

/** 用于验证不存在教程展示不可访问态且不提供重试。 */
test('不可访问教程展示统一不可访问态', async () => {
  renderDetail(
    {},
    {
      /** 用于返回按当前查询串解析的参数。 */
      '/api/v1/tutorials/tut-1': () =>
        jsonResponse({ code: 'NOT_FOUND', message: '教程不存在' }, 404),
    },
  );
  expect(await screen.findByText('无法访问该教程')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '重新读取' })).not.toBeInTheDocument();
});

/** 用于验证生成中状态以真实计数宣告且不伪造百分比。 */
test('生成中状态展示真实章节计数', async () => {
  renderDetail(
    detailPayload({
      stage: { completed: 3, phase: 'generating', sourcesGathered: null, total: 12 },
      status: 'generating',
    }),
  );
  expect(await screen.findByText('章节生成中 3/12')).toBeInTheDocument();
});

/** 用于验证告警警示条渲染。 */
test('详情告警渲染警示条', async () => {
  renderDetail(detailPayload({ warnings: ['部分来源不可访问，已跳过。'] }));
  expect(await screen.findByText('本教程有告警')).toBeInTheDocument();
  expect(screen.getByText('部分来源不可访问，已跳过。')).toBeInTheDocument();
});
