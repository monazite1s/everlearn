/**
 * @fileoverview 验证大纲环检测与结构校验纯函数。
 */

import { describe, expect, test } from 'vitest';

import { hasDependencyCycle, validateOutline } from './outline-graph';

describe('outline-graph validation', () => {
  test('空依赖与无环依赖通过校验', () => {
    const result = validateOutline({
      chapters: [
        { dependsOn: [], nodeKey: 'a', title: 'A' },
        { dependsOn: ['a'], nodeKey: 'b', title: 'B' },
      ],
    });
    expect(result).toEqual({ issue: null, ok: true });
  });

  test('直接循环依赖被判定为环', () => {
    const result = validateOutline({
      chapters: [
        { dependsOn: ['b'], nodeKey: 'a', title: 'A' },
        { dependsOn: ['a'], nodeKey: 'b', title: 'B' },
      ],
    });
    expect(result).toEqual({ issue: 'dependency_cycle', ok: false });
  });
});

describe('outline-graph cycle detection', () => {
  test('间接循环依赖同样被判定为环', () => {
    expect(
      hasDependencyCycle(
        ['a', 'b', 'c'],
        new Map([
          ['a', ['b']],
          ['b', ['c']],
          ['c', ['a']],
        ]),
      ),
    ).toBe(true);
  });

  test('缺失依赖与重复 nodeKey 分别返回对应错误', () => {
    expect(
      validateOutline({ chapters: [{ dependsOn: ['ghost'], nodeKey: 'a', title: 'A' }] }).issue,
    ).toBe('missing_dependency');
    expect(
      validateOutline({
        chapters: [
          { dependsOn: [], nodeKey: 'a', title: 'A' },
          { dependsOn: [], nodeKey: 'a', title: 'A2' },
        ],
      }).issue,
    ).toBe('duplicate_node_key');
  });

  test('空大纲被拒绝', () => {
    expect(validateOutline({ chapters: [] }).issue).toBe('chapter_empty');
  });
});
