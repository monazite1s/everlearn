/** @fileoverview 验证搜索高亮在恶意高频正文下仍保持有界工作量。 */

import { expect, test } from 'vitest';

import { createSearchSnippet } from './search-highlight';

/** 用于证明摘要成本受公开窗口约束，而不随全文命中数分配并排序。 */
function boundsWorkForFrequentSingleCharacterMatches(): void {
  const snippet = createSearchSnippet('幂'.repeat(5_000_000), '幂');
  const highlighted = snippet.segments.filter(({ highlighted }) => highlighted);
  const text = snippet.segments.map((segment) => segment.text).join('');

  expect(Array.from(text)).toHaveLength(240);
  expect(highlighted).toHaveLength(16);
  expect(snippet.segments).toHaveLength(17);
  expect(snippet).toMatchObject({ leadingTruncated: false, trailingTruncated: true });
}

/** 用于验证非法孤立代理项也不会令公开摘要突破 Unicode 字符上限。 */
function preservesUnicodeBoundaryWithUnpairedSurrogate(): void {
  const text = `幂${'a'.repeat(238)}\uD800${'b'.repeat(100)}`;
  const snippet = createSearchSnippet(text, '幂');
  const excerpt = snippet.segments.map((segment) => segment.text).join('');

  expect(Array.from(excerpt)).toHaveLength(240);
  expect(excerpt.endsWith('\uD800')).toBe(true);
  expect(snippet.trailingTruncated).toBe(true);
}

test('超长高频单字正文只处理 240 字符摘要窗口', boundsWorkForFrequentSingleCharacterMatches, 500);

test('摘要窗口按 Unicode 字符截断孤立代理项', preservesUnicodeBoundaryWithUnpairedSurrogate);
