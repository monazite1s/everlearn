/** @fileoverview Verifies native UI primitives through their public accessible behavior. */

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';

import { Button, TextArea, TextInput } from './index';

afterEach(cleanup);

/** Confirms pending actions are unavailable without losing their visible label. */
function rendersPendingButton(): void {
  render(<Button pending>保存文档</Button>);

  const button = screen.getByRole('button', { name: '保存文档' });
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute('aria-busy', 'true');
}

/** Confirms form feedback is adjacent and programmatically connected to each control. */
function connectsFormFeedback(): void {
  render(
    <>
      <TextInput label="标题" description="用于知识库目录" defaultValue="设计札记" />
      <TextArea label="摘要" error="摘要至少需要十个字" />
    </>,
  );

  const title = screen.getByRole('textbox', { name: '标题' });
  const summary = screen.getByRole('textbox', { name: '摘要' });
  expect(title).toHaveAccessibleDescription('用于知识库目录');
  expect(summary).toHaveAccessibleErrorMessage('摘要至少需要十个字');
  expect(summary).toHaveAttribute('aria-invalid', 'true');
}

test('disables pending actions', rendersPendingButton);
test('connects form help and errors', connectsFormFeedback);
