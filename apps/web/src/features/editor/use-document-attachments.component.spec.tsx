/** @fileoverview 验证保存内容剔除未完成上传的附件占位并保留既有块。 */

import { expect, test } from 'vitest';

import { omitPendingAttachments } from './use-document-attachments';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';
const UUID_D = '44444444-4444-4444-8444-444444444444';

test('剔除上传中与失败的无附件 id 占位节点', () => {
  const json = {
    content: [
      { attrs: { blockId: UUID_A }, content: [{ text: '前', type: 'text' }], type: 'paragraph' },
      {
        attrs: { alt: '图.png', attachmentId: null, blockId: UUID_B, uploading: true },
        type: 'image',
      },
      { attrs: { attachmentId: null, blockId: UUID_C, failed: true }, type: 'attachment' },
      { attrs: { blockId: UUID_D }, content: [{ text: '后', type: 'text' }], type: 'paragraph' },
    ],
    type: 'doc',
  };
  const result = omitPendingAttachments(json);
  expect(result.content).toHaveLength(2);
  expect(result.content?.[0]?.attrs?.blockId).toBe(UUID_A);
  expect(result.content?.[1]?.attrs?.blockId).toBe(UUID_D);
});

test('非法附件 id 形态的占位同样被剔除', () => {
  const json = {
    content: [{ attrs: { attachmentId: 'not-a-uuid', blockId: UUID_B }, type: 'image' }],
    type: 'doc',
  };
  expect(omitPendingAttachments(json).content).toHaveLength(0);
});

test('已确认附件节点保留且原对象不被修改', () => {
  const json = {
    content: [
      { attrs: { attachmentId: UUID_A, blockId: UUID_B }, type: 'image' },
      {
        attrs: { attachmentId: UUID_A, blockId: UUID_C, fileName: '报告.pdf' },
        type: 'attachment',
      },
    ],
    type: 'doc',
  };
  const result = omitPendingAttachments(json);
  expect(result.content).toHaveLength(2);
  expect(result).not.toBe(json);
});

test('嵌套内容中的占位同样被递归剔除', () => {
  const json = {
    content: [
      {
        attrs: { blockId: UUID_A },
        content: [
          { attrs: { attachmentId: null, blockId: UUID_B }, type: 'image' },
          { content: [{ text: '列表项', type: 'text' }], type: 'text' },
        ],
        type: 'listItem',
      },
    ],
    type: 'doc',
  };
  const result = omitPendingAttachments(json);
  expect(result.content?.[0]?.content).toHaveLength(1);
});
