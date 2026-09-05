/**
 * @fileoverview 验证 LLM 输出 JSON 对象提取的围栏、嵌套、字符串边界与多起点重试。
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
