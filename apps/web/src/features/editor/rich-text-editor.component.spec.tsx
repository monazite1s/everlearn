/** @fileoverview 验证最小编辑器组件挂载与 Slash Menu 的打开、过滤和选择行为。 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { afterEach, expect, test } from 'vitest';

import type { EditorDocumentJson } from './editor-schema';
import { RichTextEditor } from './rich-text-editor';

/** 用于挂载编辑器并捕获实例驱动命令。 */
async function mountEditor(content?: EditorDocumentJson): Promise<Editor> {
  const holder: { editor?: Editor } = {};
  render(
    <RichTextEditor
      initialContent={content}
      onCreate={(editor) => {
        holder.editor = editor;
      }}
    />,
  );
  await waitFor(() => {
    if (!holder.editor) {
      throw new Error('编辑器未就绪');
    }
  });
  return holder.editor!;
}

/** 用于在空段落末尾插入斜杠触发词。 */
function typeTrigger(editor: Editor, text: string): void {
  editor.commands.focus('end');
  editor.commands.insertContent(text);
}

afterEach(() => {
  cleanup();
});

test('挂载后内容区可聚焦并具备多行文本框语义', async () => {
  const editor = await mountEditor({
    content: [{ content: [{ text: '初始内容', type: 'text' }], type: 'paragraph' }],
    type: 'doc',
  });
  const textbox = screen.getByRole('textbox');
  expect(textbox).toHaveAttribute('aria-multiline', 'true');
  expect(textbox).toHaveAttribute('aria-label', '文档正文');
  expect(screen.getByText('初始内容')).toBeVisible();
  expect(editor.state.doc.textContent).toBe('初始内容');
});

test('输入斜杠打开菜单，方向键加回车插入标题并关闭菜单', async () => {
  const editor = await mountEditor({ content: [{ type: 'paragraph' }], type: 'doc' });
  act(() => typeTrigger(editor, '/'));
  expect(await screen.findByRole('option', { name: '标题 1' })).toBeVisible();
  act(() => {
    fireEvent.keyDown(editor.view.dom, { key: 'ArrowDown' });
    fireEvent.keyDown(editor.view.dom, { key: 'Enter' });
  });
  expect(editor.state.doc.firstChild?.type.name).toBe('heading');
  expect(editor.state.doc.firstChild?.attrs.level).toBe(1);
  expect(editor.state.doc.textContent).toBe('');
  expect(screen.queryByRole('option')).not.toBeInTheDocument();
});

test('菜单按查询词过滤只保留匹配项', async () => {
  const editor = await mountEditor({ content: [{ type: 'paragraph' }], type: 'doc' });
  act(() => typeTrigger(editor, '/head'));
  const options = await screen.findAllByRole('option');
  expect(options.map((option) => option.textContent)).toEqual([
    '标题 1',
    '标题 2',
    '标题 3',
    '标题 4',
  ]);
});

test('查询无匹配时展示空态且无可选项', async () => {
  const editor = await mountEditor({ content: [{ type: 'paragraph' }], type: 'doc' });
  act(() => typeTrigger(editor, '/zzz'));
  expect(await screen.findByText('没有匹配的块类型')).toBeVisible();
  expect(screen.queryByRole('option')).not.toBeInTheDocument();
});

test('Escape 关闭菜单且保留已输入的斜杠文本', async () => {
  const editor = await mountEditor({ content: [{ type: 'paragraph' }], type: 'doc' });
  act(() => typeTrigger(editor, '/'));
  expect(await screen.findByRole('option', { name: '段落' })).toBeVisible();
  act(() => {
    fireEvent.keyDown(editor.view.dom, { key: 'Escape' });
  });
  expect(screen.queryByRole('option')).not.toBeInTheDocument();
  expect(editor.state.doc.textContent).toBe('/');
});

test('点击菜单项插入对应块', async () => {
  const editor = await mountEditor({ content: [{ type: 'paragraph' }], type: 'doc' });
  act(() => typeTrigger(editor, '/'));
  fireEvent.click(await screen.findByRole('option', { name: '分割线' }));
  expect(editor.state.doc.firstChild?.type.name).toBe('horizontalRule');
  expect(editor.state.doc.textContent).toBe('');
  expect(screen.queryByRole('option')).not.toBeInTheDocument();
});
