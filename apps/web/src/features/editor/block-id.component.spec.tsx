/** @fileoverview 验证 blockId 扩展的唯一性不变量与编辑操作下的 ID 规则。 */

import { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { expect, test } from 'vitest';

import { BLOCK_NODE_TYPES } from './editor-schema';
import { createEditorSchema } from './editor-schema';
import { isBlockId } from './block-id';

/** 用于构造带可选 blockId 的测试节点。 */
function node(type: string, blockId?: string, text = '文本'): Record<string, unknown> {
  return { attrs: blockId ? { blockId } : undefined, content: [{ text, type: 'text' }], type };
}

/** 用于创建装载 schemaVersion 1 的编辑器实例并等待延迟初始化完成。 */
async function createEditor(content: unknown): Promise<Editor> {
  const editor = new Editor({ content: content as never, extensions: createEditorSchema() });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return editor;
}

/** 用于按文档顺序收集块节点的 blockId（含空值占位）。 */
function blockIds(editor: Editor): (string | null)[] {
  const ids: (string | null)[] = [];
  editor.state.doc.descendants((current: ProseMirrorNode) => {
    if (BLOCK_NODE_TYPES.includes(current.type.name as (typeof BLOCK_NODE_TYPES)[number])) {
      const id = current.attrs.blockId as string | null;
      ids.push(id);
    }
  });
  return ids;
}

test('导入缺失 ID 的文档时为每个批准块补齐合法且唯一的 blockId', async () => {
  const editor = await createEditor({
    content: [
      node('paragraph'),
      node('heading'),
      { content: [node('paragraph')], type: 'blockquote' },
    ],
    type: 'doc',
  });
  const ids = blockIds(editor);
  expect(ids).toHaveLength(4);
  for (const id of ids) {
    expect(isBlockId(id)).toBe(true);
  }
  expect(new Set(ids).size).toBe(4);
});

test('空的最小正文可以加载且不会破坏唯一性', async () => {
  const editor = await createEditor({ content: [], type: 'doc' });
  const ids = blockIds(editor).filter((id): id is string => id !== null);
  expect(new Set(ids).size).toBe(ids.length);
});

test('导入重复 ID 时按文档顺序保留首个并重分配其余', async () => {
  const editor = await createEditor({
    content: [
      node('paragraph', '11111111-1111-4111-8111-111111111111'),
      node('paragraph', '11111111-1111-4111-8111-111111111111'),
    ],
    type: 'doc',
  });
  const [first, second] = blockIds(editor);
  expect(first).toBe('11111111-1111-4111-8111-111111111111');
  expect(second).not.toBe(first);
  expect(isBlockId(second)).toBe(true);
});

test('导入非法格式的 blockId 时重新分配', async () => {
  const editor = await createEditor({ content: [node('paragraph', 'not-a-uuid')], type: 'doc' });
  const [id] = blockIds(editor);
  expect(id).not.toBe('not-a-uuid');
  expect(isBlockId(id)).toBe(true);
});

test('拆分块时原块保留 ID、新块获得新 ID', async () => {
  const editor = await createEditor({ content: [node('paragraph')], type: 'doc' });
  const originalId = blockIds(editor)[0];
  editor.commands.setTextSelection(2);
  editor.commands.splitBlock();
  const [firstId, secondId] = blockIds(editor);
  expect(firstId).toBe(originalId);
  expect(secondId).not.toBe(originalId);
});

test('在块尾回车产生的新空块获得新 ID', async () => {
  const editor = await createEditor({ content: [node('paragraph')], type: 'doc' });
  const originalId = blockIds(editor)[0];
  editor.commands.setTextSelection(4);
  editor.commands.splitBlock();
  const [firstId, secondId] = blockIds(editor);
  expect(firstId).toBe(originalId);
  expect(secondId).not.toBe(originalId);
  expect(isBlockId(secondId)).toBe(true);
});

test('粘贴携带既有 ID 的块时重新分配避免重复', async () => {
  const editor = await createEditor({ content: [node('paragraph')], type: 'doc' });
  const originalId = blockIds(editor)[0];
  editor.commands.setTextSelection(4);
  editor.commands.insertContent(node('paragraph', originalId!));
  const ids = blockIds(editor);
  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(2);
  expect(ids[0]).toBe(originalId);
});

test('合并块时保留目标块自身的 ID', async () => {
  const editor = await createEditor({
    content: [
      node('paragraph', '11111111-1111-4111-8111-111111111111', '第一块'),
      node('paragraph', '22222222-2222-4222-8222-222222222222', '第二块'),
    ],
    type: 'doc',
  });
  editor.commands.setTextSelection(6);
  editor.commands.joinBackward();
  const ids = blockIds(editor);
  expect(ids).toHaveLength(1);
  expect(ids[0]).toBe('11111111-1111-4111-8111-111111111111');
  expect(editor.state.doc.textContent).toBe('第一块第二块');
});

test('批准的块与标记可无损 JSON 往返且 ID 保持稳定', async () => {
  const source = {
    content: [
      { attrs: { level: 2 }, content: [{ text: '标题', type: 'text' }], type: 'heading' },
      { content: [{ marks: [{ type: 'bold' }], text: '重点', type: 'text' }], type: 'paragraph' },
      { content: [node('paragraph')], type: 'blockquote' },
      { content: [{ content: [node('paragraph')], type: 'listItem' }], type: 'bulletList' },
      { content: [{ content: [node('paragraph')], type: 'listItem' }], type: 'orderedList' },
      { content: [{ text: 'const a = 1;', type: 'text' }], type: 'codeBlock' },
      { type: 'horizontalRule' },
    ],
    type: 'doc',
  };
  const first = await createEditor(source);
  const firstJson = first.getJSON();
  const second = await createEditor(firstJson);
  expect(second.getJSON()).toEqual(firstJson);
  const firstIds = blockIds(first);
  expect(new Set(firstIds).size).toBe(firstIds.length);
  expect(blockIds(second)).toEqual(firstIds);
});

test('setContent 导入的缺失 ID 内容同样会被补齐', async () => {
  const editor = await createEditor({ content: [node('paragraph')], type: 'doc' });
  editor.commands.setContent({ content: [node('heading'), node('paragraph')], type: 'doc' });
  const ids = blockIds(editor);
  expect(ids).toHaveLength(2);
  expect(new Set(ids).size).toBe(2);
});

/** 用于断言当前文档全部 blockId 非空且唯一。 */
function expectUniqueIds(editor: Editor): void {
  const ids = blockIds(editor);
  expect(ids.every((id): id is string => isBlockId(id))).toBe(true);
  expect(new Set(ids).size).toBe(ids.length);
}

test('undo 重放重复 ID 导入时唯一性保持', async () => {
  const editor = await createEditor({ content: [node('paragraph')], type: 'doc' });
  const originalId = blockIds(editor)[0];
  editor.commands.setTextSelection(4);
  editor.commands.insertContent(node('paragraph', originalId!));
  expectUniqueIds(editor);
  editor.commands.undo();
  expectUniqueIds(editor);
  editor.commands.redo();
  expectUniqueIds(editor);
});

test('undo 撤销拆分块时唯一性保持', async () => {
  const editor = await createEditor({ content: [node('paragraph')], type: 'doc' });
  editor.commands.setTextSelection(2);
  editor.commands.splitBlock();
  expectUniqueIds(editor);
  editor.commands.undo();
  expectUniqueIds(editor);
  editor.commands.redo();
  expectUniqueIds(editor);
});
