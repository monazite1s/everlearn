/** @fileoverview 验证保存五态徽标与冲突常驻提示的重载、复制反馈。 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { ConflictAlert, SaveStatusBadge } from './save-status';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test('空闲与冲突态不渲染徽标', () => {
  const { rerender } = render(
    <SaveStatusBadge onCopyLocal={() => undefined} onRetry={() => undefined} status="idle" />,
  );
  expect(screen.queryByText(/保存/)).not.toBeInTheDocument();
  rerender(
    <SaveStatusBadge onCopyLocal={() => undefined} onRetry={() => undefined} status="conflict" />,
  );
  expect(screen.queryByText(/保存/)).not.toBeInTheDocument();
});

test('保存中徽标可见', () => {
  render(
    <SaveStatusBadge onCopyLocal={() => undefined} onRetry={() => undefined} status="saving" />,
  );
  expect(screen.getByText('保存中')).toBeVisible();
});

test('已保存徽标短暂停留后隐藏', () => {
  vi.useFakeTimers();
  try {
    render(
      <SaveStatusBadge onCopyLocal={() => undefined} onRetry={() => undefined} status="saved" />,
    );
    expect(screen.getByText('已保存')).toBeVisible();
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.queryByText('已保存')).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});

test('失败态提供重试与复制旁挂按钮并回调', () => {
  const retry = vi.fn();
  const copy = vi.fn();
  render(<SaveStatusBadge onCopyLocal={copy} onRetry={retry} status="failed" />);
  fireEvent.click(screen.getByRole('button', { name: '重试保存' }));
  fireEvent.click(screen.getByRole('button', { name: '复制本地内容' }));
  expect(retry).toHaveBeenCalledTimes(1);
  expect(copy).toHaveBeenCalledTimes(1);
});

test('冲突提示展示服务端版本时间并提供重载与复制', async () => {
  const reload = vi.fn();
  const copy = vi.fn().mockResolvedValue(true);
  render(
    <ConflictAlert
      onCopyLocal={copy}
      onReload={reload}
      serverUpdatedAt="2026-08-17T10:00:00.000Z"
    />,
  );
  expect(screen.getByText(/2026年8月17日/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '重载文档' }));
  expect(reload).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: '复制本地内容' }));
  expect(await screen.findByText('已复制到剪贴板')).toBeVisible();
});

test('复制失败时给出可行动反馈', async () => {
  render(
    <ConflictAlert
      onCopyLocal={vi.fn().mockResolvedValue(false)}
      onReload={() => undefined}
      serverUpdatedAt={undefined}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '复制本地内容' }));
  expect(await screen.findByText('复制失败，请重试')).toBeVisible();
});
