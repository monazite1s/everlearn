/** @fileoverview 验证信任边界收窄函数对非法正文 JSON 的拒绝矩阵。 */

import { expect, test } from 'vitest';

import { parseDocumentJson } from './parse-document-json';

const VALID_ID = '33333333-3333-4333-8333-333333333333';

/** 用于构造带 blockId 的段落节点。 */
function paragraph(blockId?: string): Record<string, unknown> {
  return { attrs: blockId ? { blockId } : undefined, type: 'paragraph' };
}

test('最小正文通过解析', () => {
  expect(parseDocumentJson({ content: [], type: 'doc' })).toEqual({ content: [], type: 'doc' });
});

test('缺少 content 字段的 doc 通过解析', () => {
  expect(parseDocumentJson({ type: 'doc' })).toEqual({ type: 'doc' });
});

test('覆盖全部批准节点与标记的正文通过解析', () => {
  const doc = {
    content: [
      {
        attrs: { level: 1 },
        content: [{ text: '标题', type: 'text' }],
        type: 'heading',
      },
      {
        content: [
          {
            marks: [
              { type: 'bold' },
              { type: 'italic' },
              { type: 'strike' },
              { type: 'code' },
              { type: 'underline' },
            ],
            text: '全部标记',
            type: 'text',
          },
          { type: 'hardBreak' },
          {
            marks: [{ attrs: { href: 'https://example.com' }, type: 'link' }],
            text: '链接',
            type: 'text',
          },
        ],
        type: 'paragraph',
      },
      { content: [{ content: [paragraph(VALID_ID)], type: 'listItem' }], type: 'bulletList' },
      { content: [{ content: [paragraph()], type: 'listItem' }], type: 'orderedList' },
      { content: [paragraph()], type: 'blockquote' },
      { content: [{ text: 'code', type: 'text' }], type: 'codeBlock' },
      { type: 'horizontalRule' },
    ],
    type: 'doc',
  };
  expect(parseDocumentJson(doc)).toEqual(doc);
});

test.each([
  ['null', null],
  ['undefined', undefined],
  ['字符串', '{"type":"doc"}'],
  ['数字', 1],
  ['数组', []],
  ['空对象', {}],
  ['非 doc 类型', { type: 'paragraph' }],
  ['content 非数组', { content: 'x', type: 'doc' }],
  ['顶层未知节点', { content: [{ type: 'table' }], type: 'doc' }],
  ['嵌套未知节点', { content: [{ content: [{ type: 'image' }], type: 'paragraph' }], type: 'doc' }],
  ['节点缺 type', { content: [{ text: 'x' }], type: 'doc' }],
  ['节点 type 非字符串', { content: [{ type: 3 }], type: 'doc' }],
  ['text 非字符串', { content: [{ text: 1, type: 'text' }], type: 'doc' }],
  ['attrs 非对象', { content: [{ attrs: 'x', type: 'paragraph' }], type: 'doc' }],
  ['marks 非数组', { content: [{ marks: 'bold', type: 'paragraph' }], type: 'doc' }],
  ['未知标记', { content: [{ marks: [{ type: 'highlight' }], type: 'paragraph' }], type: 'doc' }],
  [
    '非法 blockId',
    { content: [{ attrs: { blockId: 'not-uuid' }, type: 'paragraph' }], type: 'doc' },
  ],
  ['越界标题层级', { content: [{ attrs: { level: 5 }, type: 'heading' }], type: 'doc' }],
  ['非整数标题层级', { content: [{ attrs: { level: 1.5 }, type: 'heading' }], type: 'doc' }],
  ['content 子项非对象', { content: ['x'], type: 'doc' }],
])('拒绝 %s', (_name, value) => {
  expect(parseDocumentJson(value)).toBeUndefined();
});

test('attrs 中 blockId 为 null 视为缺失并通过', () => {
  expect(
    parseDocumentJson({ content: [{ attrs: { blockId: null }, type: 'paragraph' }], type: 'doc' }),
  ).toBeDefined();
});
