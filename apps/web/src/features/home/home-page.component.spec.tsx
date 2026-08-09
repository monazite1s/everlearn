/** @fileoverview Verifies every documented static home-page state. */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import { homeStateFixtures, readyHomeModel } from './home-data';
import { HomePage } from './home-page';

afterEach(cleanup);

/** Confirms knowledge remains primary and active runs expose text status. */
function rendersReadyState(): void {
  render(<HomePage model={readyHomeModel} />);

  expect(screen.getByRole('heading', { level: 1, name: '首页' })).toHaveAttribute(
    'data-page-title',
  );
  expect(screen.getByRole('heading', { level: 2, name: '知识库' })).toBeVisible();
  expect(screen.getByRole('link', { name: /^Agent 工程26 篇文档/ })).toBeVisible();
  expect(screen.getByText('等待确认')).toBeVisible();
}

/** Confirms first use explains knowledge bases without rendering an empty run card. */
function rendersFirstUseState(): void {
  render(<HomePage model={homeStateFixtures.empty} />);

  expect(screen.getByRole('link', { name: '创建第一个知识库' })).toBeVisible();
  expect(screen.getByText(/还没有最近文档/)).toBeVisible();
  expect(screen.queryByRole('heading', { level: 2, name: '进行中' })).not.toBeInTheDocument();
  expect(screen.queryByText('等待确认')).not.toBeInTheDocument();
}

/** Confirms independent failures preserve successful knowledge content and retries. */
function rendersPartialFailureState(): void {
  render(<HomePage model={homeStateFixtures.partialFailure} />);

  expect(screen.getByRole('link', { name: /^Agent 工程26 篇文档/ })).toBeVisible();
  expect(screen.getByRole('link', { name: '重试最近文档' })).toBeVisible();
  expect(screen.getByRole('link', { name: '重试运行状态' })).toBeVisible();
}

/** Confirms loading regions announce progress without replacing the page frame. */
function rendersLoadingState(): void {
  render(<HomePage model={homeStateFixtures.loading} />);

  expect(screen.getAllByLabelText('正在加载')).toHaveLength(3);
  expect(screen.getByRole('heading', { level: 1, name: '首页' })).toBeVisible();
}

/** Confirms offline reading remains available while write controls are disabled. */
function rendersOfflineState(): void {
  render(<HomePage model={homeStateFixtures.offline} />);

  expect(screen.getByRole('status')).toHaveTextContent('当前离线');
  expect(screen.getByRole('textbox', { name: '记录内容' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '放入 Inbox' })).toBeDisabled();
  expect(screen.getByRole('link', { name: /可恢复 Agent 的状态设计/ })).toBeVisible();
}

test('renders the ready home state', rendersReadyState);
test('renders the first-use home state', rendersFirstUseState);
test('renders a partial-failure home state', rendersPartialFailureState);
test('renders the loading home state', rendersLoadingState);
test('renders the offline home state', rendersOfflineState);
