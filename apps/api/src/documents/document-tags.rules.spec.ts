/** @fileoverview 验证标签展示名的规范化折叠与空名过滤语义。 */

import { describe, expect, test } from 'vitest';

import { canonicalTagName, canonicalizeTagNames } from './document-tags.service';

describe('canonicalTagName', () => {
  test('大小写与首尾空白折叠为同一规范名', () => {
    expect(canonicalTagName('  React  ')).toBe('react');
    expect(canonicalTagName('React')).toBe('react');
  });

  test('中文名保持原样仅去空白', () => {
    expect(canonicalTagName(' 数据库 ')).toBe('数据库');
  });
});

describe('canonicalizeTagNames', () => {
  test('重复名去重且保留后写入的展示名', () => {
    const canonical = canonicalizeTagNames(['React', '  react ', 'RUST']);
    expect(canonical.size).toBe(2);
    expect(canonical.get('react')).toBe('react');
    expect(canonical.get('rust')).toBe('RUST');
  });

  test('纯空白与空名被丢弃', () => {
    expect(canonicalizeTagNames(['  ', '实', ''])).toEqual(new Map([['实', '实']]));
  });
});
