/**
 * @fileoverview 验证 LLM 输出 JSON 对象提取的围栏、嵌套、字符串边界、多起点重试与修复重试。
 */

import { describe, expect, it } from 'vitest';

import { extractJsonObject } from './json-extraction';

describe('extractJsonObject', () => {
  it('解析裸 JSON 对象', () => {
    expect(extractJsonObject('{"answer":"a","citations":[]}')).toEqual({
      answer: 'a',
      citations: [],
    });
  });

  it('剥除 json 代码围栏后解析', () => {
    expect(extractJsonObject('```json\n{"keep":[1,2]}\n```')).toEqual({ keep: [1, 2] });
    expect(extractJsonObject('```\n{"keep":[]}\n```')).toEqual({ keep: [] });
  });

  it('提取前缀文本后的首个平衡对象且字符串内的花括号不参与计数', () => {
    const raw = '结果如下 {"a":"包含 } 与 { 的文本","b":{"c":1}} 尾部';
    expect(extractJsonObject(raw)).toEqual({ a: '包含 } 与 { 的文本', b: { c: 1 } });
  });

  it('字符串内的转义引号不提前终止字符串状态', () => {
    expect(extractJsonObject('{"a":"say \\"}\\" ok"}')).toEqual({ a: 'say "}" ok' });
  });

  it('首个起点非法时重试后续起点', () => {
    expect(extractJsonObject('说明 {"bad" } 结论 {"good":1}')).toEqual({ good: 1 });
  });

  it('只取首个平衡对象，未闭合或无对象返回 null', () => {
    expect(extractJsonObject('{"a":1} 尾部 {"b":')).toEqual({ a: 1 });
    expect(extractJsonObject('{"a":')).toBeNull();
    expect(extractJsonObject('没有对象')).toBeNull();
    expect(extractJsonObject('')).toBeNull();
  });
});

describe('extractJsonObject 修复重试', () => {
  it('修复 markdown 字段内的字面换行后成功解析（真 GLM 失败样本）', () => {
    const raw =
      '{"reply":"建议重写引言","proposal":{"kind":"chapter","payload":{"nodeKey":"intro","markdown":"# 引言\n第一段。\n第二段。"}}}';
    expect(extractJsonObject(raw)).toEqual({
      reply: '建议重写引言',
      proposal: {
        kind: 'chapter',
        payload: { nodeKey: 'intro', markdown: '# 引言\n第一段。\n第二段。' },
      },
    });
  });

  it('修复非法转义序列（webpack 示例 \\.js）后成功解析', () => {
    const raw = '{"reply":"入口是 \\.js 文件","proposal":null}';
    expect(extractJsonObject(raw)).toEqual({ reply: '入口是 \\.js 文件', proposal: null });
  });

  it('合法 JSON 不经修复保持原样（幂等）', () => {
    expect(extractJsonObject('{"reply":"多行\\n文本","proposal":null}')).toEqual({
      reply: '多行\n文本',
      proposal: null,
    });
  });

  it('修复裸换行时字符串内合法的 \\\\n 转义不被二次转义', () => {
    const raw = '{"reply":"路径 C:\\\\new\\\\folder\n第二行","proposal":null}';
    expect(extractJsonObject(raw)).toEqual({
      reply: '路径 C:\\new\\folder\n第二行',
      proposal: null,
    });
  });
});

describe('extractJsonObject 闭合失败修复', () => {
  it('修复尾段转义引号破坏闭合并补全花括号（真 GLM 失败样本）', () => {
    const raw =
      '{"reply":"已重写引言","proposal":{"kind":"chapter","payload":{"nodeKey":"intro","markdown":"# 引言\\"}}';
    expect(extractJsonObject(raw)).toEqual({
      reply: '已重写引言',
      proposal: {
        kind: 'chapter',
        payload: { nodeKey: 'intro', markdown: '# 引言\\' },
      },
    });
  });

  it('闭合修复后首尾多余的右花括号被截断', () => {
    expect(extractJsonObject('{"a":"x\\"}}')).toEqual({ a: 'x\\' });
  });

  it('字符串与对象被截断到文本末尾时补齐闭合引号与花括号', () => {
    expect(extractJsonObject('{"reply":"回答被截断')).toEqual({ reply: '回答被截断' });
    expect(extractJsonObject('{"outer":{"inner":"v"')).toEqual({ outer: { inner: 'v' } });
  });

  it('闭合失败且补全后仍非法时返回 null', () => {
    expect(extractJsonObject('{"a":1 {"b":2')).toBeNull();
  });
});
