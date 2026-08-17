/** @fileoverview 验证工具栏 roving tabindex、激活反馈与禁用降级。 */

import { cleanup, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import { afterEach, expect, test } from 'vitest';

import { createEditorSchema } from './editor-schema';
import { EditorToolbar, FORMATTING_ACTIONS } from './editor-toolbar';

/** 用于在 detached 环境创建真实编辑器实例驱动工具栏判定。 */
function createHeadlessEditor(): Editor {
  return new Editor({
    content: {
      content: [{ content: [{ text: '文本', type: 'text' }], type: 'paragraph' }],
      type: 'doc',
    },
    extensions: createEditorSchema(),
  });
}

/** 用于选中段首文字以驱动标记类命令。 */
function selectFirstWord(editor: Editor): void {
  editor.commands.focus();
  editor.commands.setTextSelection({ from: 1, to: 3 });
}

afterEach(() => {
  cleanup();
});

test('动作清单覆盖规格要求的全部基础格式化命令', () => {
  expect(FORMATTING_ACTIONS.map((action) => action.id)).toEqual([
    'bold',
    'italic',
    'strike',
    'code',
    'bullet-list',
    'ordered-list',
    'code-block',
  ]);
});

test('工具栏具备角色与方向语义且首按钮唯一可 Tab', () => {
  const editor = createHeadlessEditor();
  render(<EditorToolbar disabled={false} editor={editor} />);
  const toolbar = screen.getByRole('toolbar', { name: '格式化' });
  expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');
  const tabbable = screen.getAllByRole('button').filter((button) => button.tabIndex === 0);
  expect(tabbable).toHaveLength(1);
  expect(tabbable[0]).toHaveAccessibleName('粗体');
  editor.destroy();
});

test('方向键把 roving 焦点实际移动到相邻按钮', async () => {
  const editor = createHeadlessEditor();
  render(<EditorToolbar disabled={false} editor={editor} />);
  const toolbar = screen.getByRole('toolbar');
  screen.getByRole('button', { name: '粗体' }).focus();
  fireEvent.keyDown(toolbar, { key: 'ArrowRight' });
  await waitFor(() => expect(screen.getByRole('button', { name: '斜体' })).toHaveFocus());
  expect(screen.getByRole('button', { name: '斜体' }).tabIndex).toBe(0);
  fireEvent.keyDown(toolbar, { key: 'ArrowLeft' });
  await waitFor(() => expect(screen.getByRole('button', { name: '粗体' })).toHaveFocus());
  editor.destroy();
});

test('链接地址输入行内的方向键不被工具栏劫持', () => {
  const editor = createHeadlessEditor();
  selectFirstWord(editor);
  render(<EditorToolbar disabled={false} editor={editor} />);
  fireEvent.click(screen.getByRole('button', { name: '链接' }));
  const input = screen.getByLabelText('链接地址');
  input.focus();
  const event = createEvent.keyDown(input, { key: 'ArrowLeft' });
  fireEvent(input, event);
  expect(event.defaultPrevented).toBe(false);
  expect(input).toHaveFocus();
  editor.destroy();
});

test('点击粗体按钮切换选区激活态并回写编辑器', async () => {
  const editor = createHeadlessEditor();
  selectFirstWord(editor);
  render(<EditorToolbar disabled={false} editor={editor} />);
  const bold = screen.getByRole('button', { name: '粗体' });
  fireEvent.click(bold);
  await waitFor(() => expect(editor.isActive('bold')).toBe(true));
  expect(bold).toHaveAttribute('aria-pressed', 'true');
  editor.destroy();
});

test('链接按钮展开行内输入并支持应用与解除', async () => {
  const editor = createHeadlessEditor();
  selectFirstWord(editor);
  render(<EditorToolbar disabled={false} editor={editor} />);
  fireEvent.click(screen.getByRole('button', { name: '链接' }));
  const input = screen.getByLabelText('链接地址');
  fireEvent.change(input, { target: { value: 'https://example.com' } });
  fireEvent.submit(input.closest('form')!);
  await waitFor(() => expect(editor.isActive('link')).toBe(true));
  expect(editor.getAttributes('link').href).toBe('https://example.com');
  fireEvent.click(screen.getByRole('button', { name: '解除链接' }));
  await waitFor(() => expect(editor.isActive('link')).toBe(false));
  editor.destroy();
});

test('禁用态全部按钮 aria-disabled 且不执行命令', () => {
  const editor = createHeadlessEditor();
  selectFirstWord(editor);
  render(<EditorToolbar disabled editor={editor} />);
  const bold = screen.getByRole('button', { name: '粗体' });
  expect(bold).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(bold);
  expect(editor.isActive('bold')).toBe(false);
  editor.destroy();
});

test('无编辑器实例时按钮降级为禁用', () => {
  render(<EditorToolbar disabled={false} editor={null} />);
  fireEvent.click(screen.getByRole('button', { name: '粗体' }));
  expect(screen.getByRole('button', { name: '粗体' })).toHaveAttribute('aria-disabled', 'true');
});
