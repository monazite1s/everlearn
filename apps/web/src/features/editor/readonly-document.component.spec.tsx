/** @fileoverview 验证只读渲染器的锚点目录提取、渲染与点击定位。 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';

import { extractHeadings, ReadonlyDocument } from './readonly-document';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';

/** 用于构造带多个标题的最小正文。 */
function headingDoc() {
  return {
    content: [
      {
        attrs: { blockId: UUID_A, level: 1 },
        content: [{ text: '一级', type: 'text' }],
        type: 'heading',
      },
      {
        attrs: { blockId: UUID_B, level: 2 },
        content: [{ text: '二级', type: 'text' }],
        type: 'heading',
      },
      {
        attrs: { blockId: '44444444-4444-4444-8444-444444444444' },
        content: [{ text: '正文', type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  };
}

afterEach(() => {
  cleanup();
});

test('目录提取只收集带合法块 ID 与文本的标题', () => {
  const headings = extractHeadings({
    content: [
      {
        attrs: { blockId: UUID_A, level: 1 },
        content: [{ text: '标题一', type: 'text' }],
        type: 'heading',
      },
      {
        attrs: { blockId: null, level: 2 },
        content: [{ text: '无 ID', type: 'text' }],
        type: 'heading',
      },
      {
        attrs: { blockId: UUID_B, level: 5 },
        content: [{ text: '越界层级', type: 'text' }],
        type: 'heading',
      },
      { attrs: { blockId: UUID_C, level: 3 }, content: [], type: 'heading' },
    ],
    type: 'doc',
  });
  expect(headings).toEqual([{ blockId: UUID_A, level: 1, text: '标题一' }]);
});

test('目录默认折叠，展开后按块 ID 定位到正文标题', () => {
  const scrollTo = vi.fn();
  Element.prototype.scrollIntoView = scrollTo;
  render(<ReadonlyDocument contentJson={headingDoc()} documentVersion={1} />);
  const toggle = screen.getByRole('button', { name: '目录' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('navigation', { name: '文档目录' })).not.toBeInTheDocument();
  fireEvent.click(toggle);
  const nav = screen.getByRole('navigation', { name: '文档目录' });
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const links = nav.querySelectorAll('a');
  expect(links).toHaveLength(2);
  expect(links[0]).toHaveAttribute('href', `#${UUID_A}`);
  expect(links[1]).toHaveTextContent('二级');
  fireEvent.click(links[1]!);
  expect(scrollTo).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('region', { name: '文档正文（只读）' }).innerHTML).toContain(
    `data-block-id="${UUID_B}"`,
  );
});

test('无标题正文不渲染目录', () => {
  render(
    <ReadonlyDocument
      contentJson={{
        content: [
          {
            attrs: { blockId: UUID_C },
            content: [{ text: '正文', type: 'text' }],
            type: 'paragraph',
          },
        ],
        type: 'doc',
      }}
      documentVersion={1}
    />,
  );
  expect(screen.queryByRole('navigation', { name: '文档目录' })).not.toBeInTheDocument();
});

test('非法正文回退为空文档而不抛错', () => {
  render(
    <ReadonlyDocument
      contentJson={{ content: [{ type: '不是节点' }], type: 'doc' }}
      documentVersion={1}
    />,
  );
  const region = screen.getByRole('region', { name: '文档正文（只读）' });
  expect(region.querySelectorAll('p, h1, h2, h3, h4, blockquote, pre, ul, ol').length).toBe(0);
});
