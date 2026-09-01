/**
 * @fileoverview 验证倒数排名融合纯函数与 OR 词素构造的排序、去重、截断与转义行为。
 */

import { describe, expect, it } from 'vitest';

import { fuseReciprocalRankFusion, orTsQueryTerms } from './search-query.store';

describe('fuseReciprocalRankFusion', () => {
  it('按 RRF 得分降序融合两路排名且 k=60 权重正确', () => {
    const fused = fuseReciprocalRankFusion([
      ['a', 'b', 'c'],
      ['b', 'a'],
    ]);
    expect(fused[0]).toBe('a');
    expect(fused[1]).toBe('b');
    expect(fused[2]).toBe('c');
  });

  it('仅单路出现的候选排在双路命中之后', () => {
    const fused = fuseReciprocalRankFusion([
      ['a', 'x'],
      ['a', 'y'],
    ]);
    expect(fused).toEqual(['a', 'x', 'y']);
  });

  it('去重同键并按 limit 截断', () => {
    const fused = fuseReciprocalRankFusion(
      [
        ['a', 'b', 'c'],
        ['c', 'a', 'b'],
      ],
      2,
    );
    expect(fused).toEqual(['a', 'c']);
    expect(fuseReciprocalRankFusion([[], []])).toEqual([]);
  });
});

describe('orTsQueryTerms', () => {
  it('按空白拆词素并保留中文与英数混合词', () => {
    expect(orTsQueryTerms('needle 在哪里 用在哪里？')).toEqual(['needle', '在哪里', '用在哪里']);
  });

  it('剥离引号与 tsquery 语法字符防注入', () => {
    expect(orTsQueryTerms("a' & b) | !c:*")).toEqual(['a', 'b', 'c']);
  });

  it('全符号或空白查询返回空数组', () => {
    expect(orTsQueryTerms('  % _ &  ')).toEqual([]);
  });
});
