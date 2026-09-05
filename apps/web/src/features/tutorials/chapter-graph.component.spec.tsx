/** @fileoverview 验证图视图节点状态、大图折叠展开与缩放平移控制。 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { ChapterGraphView } from './chapter-graph';
import type { TutorialChapter } from './tutorials-contract';

afterEach(() => {
  cleanup();
});

/** 用于构造章节最小载荷。 */
function chapter(overrides: Partial<TutorialChapter> = {}): TutorialChapter {
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

/** 用于渲染图视图并返回画布容器。 */
function renderGraph(chapters: readonly TutorialChapter[], onViewList = vi.fn()) {
  render(
    <ChapterGraphView
      chapters={chapters}
      currentChapterId={null}
      knowledgeBaseId="kb-1"
      onViewList={onViewList}
    />,
  );
  return screen.getByRole('region', { name: '章节依赖图' });
}

/** 用于验证节点按状态区分：完成可点击、生成中呼吸点、失败加 destructive 文字。 */
test('图节点按状态呈现标记与可点击性', () => {
  const graph = renderGraph([
    chapter({
      id: 'ch-1',
      nodeKey: 'ch-1',
      status: 'completed',
      documentId: 'doc-1',
      title: '完成章',
    }),
    chapter({ id: 'ch-2', nodeKey: 'ch-2', status: 'running', title: '生成中章' }),
    chapter({ id: 'ch-3', nodeKey: 'ch-3', status: 'failed', title: '失败章' }),
  ]);
  expect(within(graph).getByRole('link', { name: /完成章/ })).toHaveAttribute(
    'href',
    '/knowledge/kb-1/documents/doc-1',
  );
  const running = within(graph).getByRole('group', { name: /生成中章，状态 生成中/ });
  expect(within(running).getByText('生成中')).toBeInTheDocument();
  const failed = within(graph).getByRole('group', { name: /失败章，状态 失败/ });
  expect(within(failed).getByText('失败')).toBeInTheDocument();
  expect(within(graph).queryByRole('link', { name: /失败章/ })).not.toBeInTheDocument();
});

/** 用于验证依赖边的两端节点都进入布局且可访问名称携带依赖文字。 */
test('依赖边两端节点进入布局且名称描述依赖', () => {
  const graph = renderGraph([
    chapter({
      id: 'ch-1',
      nodeKey: 'ch-1',
      status: 'completed',
      documentId: 'doc-1',
      title: '基础',
    }),
    chapter({ dependsOn: ['ch-1'], id: 'ch-2', nodeKey: 'ch-2', status: 'running', title: '进阶' }),
  ]);
  const dependent = within(graph).getByRole('group', { name: /进阶，状态 生成中，依赖 基础/ });
  expect(dependent).toBeInTheDocument();
  const polylines = graph.querySelectorAll('polyline');
  expect(polylines.length).toBe(1);
});

/** 用于验证超过阈值的大图默认折叠为 +N 聚合节点并可展开。 */
test('大图默认折叠为聚合节点并支持展开', () => {
  const chapters = Array.from({ length: 55 }, (_, index) =>
    chapter({
      id: `ch-${index}`,
      nodeKey: `ch-${index}`,
      status: 'placeholder',
      title: `第 ${index + 1} 章`,
      ...(index > 0 ? { dependsOn: [`ch-${index - 1}`] } : {}),
    }),
  );
  const graph = renderGraph(chapters);
  const aggregate = within(graph).getByRole('button', { name: '展开其余 52 个章节' });
  expect(within(graph).queryByText('第 55 章')).not.toBeInTheDocument();
  fireEvent.click(aggregate);
  expect(within(graph).getByText('第 55 章')).toBeInTheDocument();
  expect(within(graph).queryByRole('button', { name: /展开其余/ })).not.toBeInTheDocument();
});

/** 用于验证缩放控制按钮与适应画布重置。 */
test('缩放与适应画布控制可用', () => {
  renderGraph([
    chapter({
      id: 'ch-1',
      nodeKey: 'ch-1',
      status: 'completed',
      documentId: 'doc-1',
      title: '完成章',
    }),
  ]);
  const svg = document.querySelector('svg');
  expect(svg).not.toBeNull();
  const transformGroup = svg!.querySelector<SVGGElement>('g.transition-transform')!;
  fireEvent.click(screen.getByRole('button', { name: '放大' }));
  expect(transformGroup.style.transform).toContain('scale(1.2)');
  fireEvent.click(screen.getByRole('button', { name: '缩小' }));
  fireEvent.click(screen.getByRole('button', { name: '适应画布' }));
  expect(transformGroup.style.transform).toBe('translate(0px, 0px) scale(1)');
});

/** 用于验证图视图提供切换到列表视图的明确提示。 */
test('提供切换到列表视图的无障碍等价入口', () => {
  const onViewList = vi.fn();
  renderGraph(
    [chapter({ id: 'ch-1', nodeKey: 'ch-1', status: 'running', title: '章节' })],
    onViewList,
  );
  fireEvent.click(screen.getByRole('button', { name: '切换到列表视图' }));
  expect(onViewList).toHaveBeenCalledWith('list');
});
