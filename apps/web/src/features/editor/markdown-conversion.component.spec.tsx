/** @fileoverview 验证 Markdown 与编辑器正文 JSON 的双向转换保留块结构。 */

import { describe, expect, it } from 'vitest';

import { docJsonToMarkdown, markdownToDocJson } from './markdown-conversion';

const markdown = [
  '# 项目概述',
  '',
  '这是**加粗**与`代码`混排的段落。',
  '',
  '- 第一项',
  '- 第二项',
  '',
  '1. 有序一',
  '2. 有序二',
  '',
  '> 引用一句名言',
  '',
  '```ts',
  'const answer = 42;',
  '```',
  '',
].join('\n');

/** 用于断言第一个指定类型节点存在并返回。 */
function firstNode(
  json: { type?: string; content?: unknown[] },
  type: string,
): Record<string, unknown> {
  const found = (json.content ?? []).find((node) => (node as { type?: string }).type === type);
  expect(found).toBeDefined();
  return found as Record<string, unknown>;
}

describe('markdown-conversion', () => {
  it('解析中文夹具为批准的块结构', () => {
    const json = markdownToDocJson(markdown);
    expect(json.type).toBe('doc');
    expect((firstNode(json, 'heading').attrs as { level: number }).level).toBe(1);
    expect(firstNode(json, 'bulletList')).toBeDefined();
    expect(firstNode(json, 'orderedList')).toBeDefined();
    expect(firstNode(json, 'blockquote')).toBeDefined();
    expect((firstNode(json, 'codeBlock').attrs as { language?: string }).language).toBe('ts');
  });

  it('round-trip 保留标题、列表、代码块与引用', () => {
    const json = markdownToDocJson(markdown);
    const output = docJsonToMarkdown(json);
    const reparsed = markdownToDocJson(output);
    expect(reparsed).toEqual(json);
  });

  it('忽略原始 HTML 片段而非解析为节点', () => {
    const json = markdownToDocJson('<img src=x onerror=alert(1)>\n\n正文段落');
    expect(JSON.stringify(json)).not.toContain('onerror');
    expect(firstNode(json, 'paragraph')).toBeDefined();
  });
});
