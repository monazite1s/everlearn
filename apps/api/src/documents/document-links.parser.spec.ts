/** @fileoverview 验证正文 JSON 中 docLink 链接的收集、块归属与去重语义。 */

import { describe, expect, test } from 'vitest';

import { collectDocumentLinks } from './document-links.parser';

const TARGET_A = 'aaaaaaa1-0000-4000-8000-000000000001';
const TARGET_B = 'aaaaaaa2-0000-4000-8000-000000000002';
const BLOCK_1 = 'bbbbbbb1-0000-4000-8000-000000000001';
const BLOCK_2 = 'bbbbbbb2-0000-4000-8000-000000000002';

/** 用于构造带 docLink 标记的文本节点。 */
function textWithLink(target: string, label: string): Record<string, unknown> {
  return {
    marks: [{ attrs: { documentId: target }, type: 'docLink' }],
    text: label,
    type: 'text',
  };
}

/** 用于构造携带块 ID 的段落节点。 */
function paragraph(blockId: string, content: readonly unknown[]): Record<string, unknown> {
  return { attrs: { blockId }, content: [...content], type: 'paragraph' };
}

describe('collectDocumentLinks', () => {
  test('收集链接并归属所在块的 blockId', () => {
    const doc = {
      content: [paragraph(BLOCK_1, [textWithLink(TARGET_A, '链接A')])],
      type: 'doc',
    };
    expect(collectDocumentLinks(doc)).toEqual([{ blockId: BLOCK_1, targetDocumentId: TARGET_A }]);
  });

  test('同块同目标去重而不同块或不同目标保留', () => {
    const doc = {
      content: [
        paragraph(BLOCK_1, [textWithLink(TARGET_A, '一'), textWithLink(TARGET_A, '二')]),
        paragraph(BLOCK_2, [textWithLink(TARGET_A, '三'), textWithLink(TARGET_B, '四')]),
      ],
      type: 'doc',
    };
    const links = collectDocumentLinks(doc);
    expect(links).toHaveLength(3);
    expect(links[0]).toEqual({ blockId: BLOCK_1, targetDocumentId: TARGET_A });
    expect(links[1]).toEqual({ blockId: BLOCK_2, targetDocumentId: TARGET_A });
    expect(links[2]).toEqual({ blockId: BLOCK_2, targetDocumentId: TARGET_B });
  });

  test('非法目标 UUID 与非 docLink 标记被忽略', () => {
    const doc = {
      content: [
        {
          attrs: { blockId: BLOCK_1 },
          content: [
            {
              marks: [{ attrs: { documentId: 'not-a-uuid' }, type: 'docLink' }],
              text: '坏目标',
              type: 'text',
            },
            { marks: [{ type: 'bold' }], text: '粗体', type: 'text' },
          ],
          type: 'paragraph',
        },
      ],
      type: 'doc',
    };
    expect(collectDocumentLinks(doc)).toEqual([]);
  });
});
