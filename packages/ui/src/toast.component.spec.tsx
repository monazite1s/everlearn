/** @fileoverview Verifies notification semantics and visible recovery actions. */

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { Toast, ToastProvider } from './index';

afterEach(cleanup);

/** Confirms foreground notifications expose their message and recovery action. */
function exposesNotificationAction(): void {
  const onRetry = vi.fn();
  render(
    <ToastProvider>
      <Toast
        action={{ altText: '重新保存当前文档', label: '重试', onClick: onRetry }}
        defaultOpen
        description="网络连接已恢复"
        title="自动保存失败"
      />
    </ToastProvider>,
  );

  expect(screen.getByText('自动保存失败')).toBeVisible();
  expect(screen.getByRole('button', { name: '关闭通知' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: '重试' }));
  expect(onRetry).toHaveBeenCalledOnce();
}

test('exposes a notification recovery action', exposesNotificationAction);
