/**
 * @fileoverview 验证资讯条目的 URL 规范化、指纹与关键词过滤。
 */

import { describe, expect, it } from 'vitest';

import { contentFingerprint, filterByKeywords, normalizeUrl, selectNewItems } from './news-feed';

describe('normalizeUrl', () => {
  it('剥离 utm 与跟踪参数并小写 host', () => {
    expect(normalizeUrl('https://Example.com/a/b?utm_source=x&id=2&fbclid=abc')).toBe(
      'https://example.com/a/b?id=2',
    );
  });

  it('排序剩余查询参数保证稳定形态', () => {
    expect(normalizeUrl('https://a.com/?b=1&a=2')).toBe('https://a.com/?a=2&b=1');
  });

  it('拒绝非 http 协议与非法 URL', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('not-a-url')).toBeNull();
  });
});

describe('contentFingerprint', () => {
  it('同一规范 URL 与标题得到稳定指纹', () => {
    const first = contentFingerprint('https://a.com/x', '标题');
    expect(first).toBe(contentFingerprint('https://a.com/x', '标题'));
    expect(first).toHaveLength(64);
  });

  it('不同标题得到不同指纹', () => {
    expect(contentFingerprint('https://a.com/x', 'a')).not.toBe(
      contentFingerprint('https://a.com/x', 'b'),
    );
  });
});

describe('filterByKeywords', () => {
  const items = [
    { link: 'https://a.com/1', summary: 'LLM 推理优化', title: 'AI 模型进展' },
    { link: 'https://a.com/2', summary: '体育赛事回顾', title: '本周球赛' },
  ];

  it('不区分大小写命中包含词', () => {
    const result = filterByKeywords(items, ['ai'], []);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('AI 模型进展');
  });

  it('排除词优先于包含词', () => {
    const result = filterByKeywords([items[0]!], ['ai'], ['模型']);
    expect(result).toHaveLength(0);
  });

  it('空包含词放行全部', () => {
    expect(filterByKeywords(items, [], [])).toHaveLength(2);
  });
});

describe('selectNewItems', () => {
  const items = [
    { link: 'https://a.com/1?utm_source=x', summary: 's1', title: 't1' },
    { link: 'https://a.com/1', summary: 'dup', title: 't1' },
    { link: 'https://a.com/2', summary: 's2', title: 't2' },
  ];

  it('按指纹去重并限制数量', () => {
    const result = selectNewItems({
      excludeKeywords: [],
      includeKeywords: [],
      items,
      limit: 10,
      seenHashes: [],
    });
    expect(result.adopted).toHaveLength(2);
    expect(result.adopted[0]!.normalizedUrl).toBe('https://a.com/1');
    expect(result.skipped.map((entry) => entry.reason)).toEqual(['重复']);
  });

  it('跳过已见指纹', () => {
    const seen = [contentFingerprint('https://a.com/1', 't1')];
    const result = selectNewItems({
      excludeKeywords: [],
      includeKeywords: [],
      items,
      limit: 10,
      seenHashes: seen,
    });
    expect(result.adopted.map((entry) => entry.item.title)).toEqual(['t2']);
  });

  it('标记关键词排除与超量截断原因', () => {
    const result = selectNewItems({
      excludeKeywords: ['球赛'],
      includeKeywords: [],
      items: [
        { link: 'https://a.com/1', summary: '技术', title: 't1' },
        { link: 'https://a.com/2', summary: '赛事', title: '球赛回顾' },
        { link: 'https://a.com/3', summary: '技术3', title: 't3' },
      ],
      limit: 1,
      seenHashes: [],
    });
    expect(result.adopted.map((entry) => entry.item.title)).toEqual(['t1']);
    expect(result.skipped.map((entry) => entry.reason)).toEqual(['关键词排除', '超量截断']);
  });
});
