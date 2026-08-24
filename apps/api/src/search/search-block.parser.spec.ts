/** @fileoverview 验证服务端正文到搜索块草稿的确定性投影规则。 */

import { DOCUMENT_JSON_MAX_DEPTH } from '@everlearn/contracts';
import { expect, test } from 'vitest';

import { parseSearchBlocks } from './search-block.parser';

/** 用于为测试块生成确定的合法 UUID。 */
const blockIdOf = (sequence: number): string =>
  `26000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;

/** 用于构造携带确定 blockId 的块级节点。 */
function blockOf(type: string, sequence: number, content?: readonly object[], attrs?: object) {
  return {
    attrs: { blockId: blockIdOf(sequence), ...attrs },
    ...(content === undefined ? {} : { content }),
    type,
  };
}

/** 用于构造正文中的文本叶子。 */
function textOf(text: string): object {
  return { text, type: 'text' };
}

/** 用于验证中英文文本按文档顺序投影为独立搜索块。 */
async function projectsChineseAndEnglishParagraphs(): Promise<void> {
  const result = await parseSearchBlocks({
    content: [
      blockOf('paragraph', 1, [textOf('知识管理')]),
      blockOf('paragraph', 2, [textOf('transactional outbox')]),
    ],
    type: 'doc',
  });

  expect(result).toMatchObject([
    { blockId: blockIdOf(1), blockOrder: 0, headingPath: [], text: '知识管理' },
    { blockId: blockIdOf(2), blockOrder: 1, headingPath: [], text: 'transactional outbox' },
  ]);
}

/** 用于验证标题使用父级路径且同级或更高标题会截断更深层级。 */
async function tracksAndTruncatesHeadingLevels(): Promise<void> {
  const result = await parseSearchBlocks({
    content: [
      blockOf('heading', 1, [textOf('第一章')], { level: 1 }),
      blockOf('heading', 2, [textOf('细节')], { level: 3 }),
      blockOf('paragraph', 3, [textOf('深层正文')]),
      blockOf('heading', 4, [textOf('第二节')], { level: 2 }),
      blockOf('paragraph', 5, [textOf('截断后正文')]),
      blockOf('heading', 6, [textOf('新章')], { level: 1 }),
    ],
    type: 'doc',
  });

  expect(result?.map(({ headingPath }) => headingPath)).toEqual([
    [],
    ['第一章'],
    ['第一章', '细节'],
    ['第一章'],
    ['第一章', '第二节'],
    [],
  ]);
}

/** 用于验证嵌套列表与引用按深度优先的真实出现顺序投影。 */
async function preservesNestedBlockOrder(): Promise<void> {
  const result = await parseSearchBlocks({
    content: [
      blockOf('bulletList', 1, [
        {
          content: [
            blockOf('paragraph', 2, [textOf('列表一')]),
            blockOf('blockquote', 3, [blockOf('paragraph', 4, [textOf('引用一')])]),
          ],
          type: 'listItem',
        },
        { content: [blockOf('paragraph', 5, [textOf('列表二')])], type: 'listItem' },
      ]),
    ],
    type: 'doc',
  });

  expect(result?.map(({ blockId }) => blockId)).toEqual([
    blockIdOf(1),
    blockIdOf(2),
    blockIdOf(3),
    blockIdOf(4),
    blockIdOf(5),
  ]);
}

/** 用于验证 hardBreak 与正文纯文本派生保持相同的换行语义。 */
async function preservesHardBreaks(): Promise<void> {
  const result = await parseSearchBlocks({
    content: [blockOf('paragraph', 1, [textOf('第一行'), { type: 'hardBreak' }, textOf('second')])],
    type: 'doc',
  });

  expect(result?.[0]?.text).toBe('第一行\nsecond');
}

/** 用于验证没有文本的空块、附件与横线不会产生搜索投影。 */
async function skipsBlocksWithoutText(): Promise<void> {
  const result = await parseSearchBlocks({
    content: [
      blockOf('paragraph', 1, []),
      blockOf('paragraph', 6, [textOf(' \n ')]),
      blockOf('image', 2, undefined, {
        attachmentId: '27000000-0000-4000-8000-000000000001',
      }),
      blockOf('horizontalRule', 3),
      blockOf('paragraph', 4, [textOf('  保留  ')]),
    ],
    type: 'doc',
  });

  expect(result).toMatchObject([{ blockId: blockIdOf(4), blockOrder: 0, text: '保留' }]);
}

/** 用于验证哈希只由规范化文本与标题路径确定且重复解析保持稳定。 */
async function producesStableContentHashes(): Promise<void> {
  const content = {
    content: [
      blockOf('heading', 1, [textOf('章节')], { level: 1 }),
      blockOf('paragraph', 2, [textOf('相同正文')]),
      blockOf('paragraph', 3, [textOf('相同正文')]),
      blockOf('heading', 4, [textOf('另一章')], { level: 1 }),
      blockOf('paragraph', 5, [textOf('相同正文')]),
    ],
    type: 'doc',
  };
  const first = await parseSearchBlocks(content);
  const second = await parseSearchBlocks(content);

  expect(second).toEqual(first);
  expect(first?.every(({ contentHash }) => /^[0-9a-f]{64}$/.test(contentHash))).toBe(true);
  expect(first?.[1]?.contentHash).toBe(first?.[2]?.contentHash);
  expect(first?.[1]?.contentHash).not.toBe(first?.[4]?.contentHash);
}

/** 用于构造超过共享上限一层的输入且避免测试夹具自身递归。 */
function overdeepContent(): object {
  let node: object = blockOf('paragraph', DOCUMENT_JSON_MAX_DEPTH + 2, [textOf('过深')]);
  for (let depth = DOCUMENT_JSON_MAX_DEPTH + 1; depth >= 1; depth -= 1) {
    node = blockOf('blockquote', depth, [node]);
  }
  return { content: [node], type: 'doc' };
}

/** 用于验证非法根和超过共享递归上限的输入以 undefined 安全失败。 */
async function rejectsUnsafeInput(): Promise<void> {
  await expect(parseSearchBlocks(null)).resolves.toBeUndefined();
  await expect(parseSearchBlocks({ content: [], type: 'paragraph' })).resolves.toBeUndefined();
  await expect(parseSearchBlocks(overdeepContent())).resolves.toBeUndefined();
}

/** 用于验证解析器不会接受绕过服务端正文校验的块属性与重复标识。 */
async function rejectsContentThatBypassesValidation(): Promise<void> {
  const duplicateBlockId = {
    content: [
      blockOf('paragraph', 1, [textOf('第一块')]),
      blockOf('paragraph', 1, [textOf('重复块')]),
    ],
    type: 'doc',
  };
  const missingBlockId = {
    content: [{ content: [textOf('缺少标识')], type: 'paragraph' }],
    type: 'doc',
  };
  const invalidHeadingLevel = {
    content: [blockOf('heading', 2, [textOf('非法标题')], { level: 5 })],
    type: 'doc',
  };

  await expect(parseSearchBlocks(duplicateBlockId)).resolves.toBeUndefined();
  await expect(parseSearchBlocks(missingBlockId)).resolves.toBeUndefined();
  await expect(parseSearchBlocks(invalidHeadingLevel)).resolves.toBeUndefined();
}

test('projects Chinese and English paragraphs', projectsChineseAndEnglishParagraphs);
test('tracks and truncates heading levels', tracksAndTruncatesHeadingLevels);
test('preserves nested block order', preservesNestedBlockOrder);
test('preserves hard breaks', preservesHardBreaks);
test('skips blocks without text', skipsBlocksWithoutText);
test('produces stable content hashes', producesStableContentHashes);
test('rejects invalid root and overdeep input', rejectsUnsafeInput);
test('rejects content that bypasses document validation', rejectsContentThatBypassesValidation);
