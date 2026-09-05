/**
 * @fileoverview 验证搜索来源查询组的构造语义。
 */

import { describe, expect, it } from 'vitest';

import { buildSearchQueries } from './news-search';

describe('buildSearchQueries', () => {
  it('无包含关键词时仅返回主题一组查询', () => {
    expect(buildSearchQueries('大模型进展', [])).toEqual(['大模型进展']);
  });

  it('有包含关键词时追加一组主题加关键词的增强查询，最多取两个关键词', () => {
    expect(buildSearchQueries('大模型进展', ['大模型进展', '推理优化', '上下文', '评测'])).toEqual([
      '大模型进展',
      '大模型进展 推理优化 上下文',
    ]);
  });
});
