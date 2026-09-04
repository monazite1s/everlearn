/** @fileoverview 验证简报运行展开详情的告警、来源明细与失败重试交互。 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { DigestRuns } from './news-digest-runs';
import type { NewsDigestRunItem, NewsSubscriptionItem } from './news-api';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const subscriptions: NewsSubscriptionItem[] = [
  {
    createdAt: '2026-09-01T08:00:00.000Z',
    feedUrl: 'https://example.com/feed.xml',
    id: 'sub-1',
    latestRunStatus: 'failed',
    name: 'AI 前沿',
    newsKnowledgeBaseId: 'kb-1',
    schedule: null,
  },
];

/** 用于构造一条简报运行。 */
function run(overrides: Partial<NewsDigestRunItem> = {}): NewsDigestRunItem {
  return {
    briefDocumentId: null,
    createdAt: '2026-09-03T08:00:00.000Z',
    errorCode: null,
    id: 'run-1',
    sourceResults: [],
    status: 'succeeded',
    subscriptionId: 'sub-1',
    warnings: [],
    ...overrides,
  };
}

/** 用于渲染一条默认订阅下的运行列表。 */
function renderRuns(runs: NewsDigestRunItem[]): void {
  render(<DigestRuns items={subscriptions} onRetry={vi.fn()} pending={false} runs={runs} />);
}

/** 用于展开第一条运行的详情。 */
function expandFirst(): void {
  fireEvent.click(screen.getByRole('button', { name: '展开或收起运行详情' }));
}

/** 用于验证展开后展示告警与来源采纳明细。 */
test('展开运行展示告警与来源明细', () => {
  renderRuns([
    run({
      sourceResults: [
        {
          decision: 'adopted',
          reason: '与本周主题相关',
          title: 'LLM 综述',
          url: 'https://example.com/a',
        },
        {
          decision: 'skipped',
          reason: '重复来源',
          title: '旧闻',
          url: 'https://example.com/b',
        },
      ],
      warnings: ['来源响应超时，已降级处理。'],
    }),
  ]);
  expandFirst();
  expect(screen.getByText('本轮运行有告警')).toBeInTheDocument();
  expect(screen.getByText('来源响应超时，已降级处理。')).toBeInTheDocument();
  expect(screen.getByText('LLM 综述')).toHaveAttribute('href', 'https://example.com/a');
  expect(screen.getByText('✓ 已采纳')).toBeInTheDocument();
  expect(screen.getByText('重复来源')).toBeInTheDocument();
  expect(screen.getByText('✗ 已跳过')).toBeInTheDocument();
});

/** 用于验证失败运行展示中文错误并触发重试。 */
test('失败运行展示错误文案并触发重试', async () => {
  const onRetry = vi.fn();
  render(
    <DigestRuns
      items={subscriptions}
      onRetry={onRetry}
      pending={false}
      runs={[run({ errorCode: 'NEWS_KB_MISSING', status: 'failed' })]}
    />,
  );
  expandFirst();
  expect(screen.getByText('资讯知识库缺失，请先重建资讯知识库。')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '重试本轮简报' }));
  await waitFor(() => expect(onRetry).toHaveBeenCalledWith('sub-1'));
  expect(screen.getByText(/重试将生成新一轮简报/)).toBeInTheDocument();
});
