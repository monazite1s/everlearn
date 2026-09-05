/** @fileoverview 验证订阅来源 DTO 按类型区分 value 校验规则。 */

import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { expect, test } from 'vitest';

import { NewsSourceDto } from './news-source.dto';

/** 用于以正文对象执行 DTO 校验并返回出错的字段名集合。 */
function validateSource(input: Record<string, unknown>): Set<string> {
  const errors = validateSync(plainToInstance(NewsSourceDto, input), {
    forbidNonWhitelisted: true,
    whitelist: true,
  });
  return new Set(errors.map((error) => error.property));
}

test('rss 与 site 来源强制 http(s) URL', () => {
  expect(validateSource({ type: 'rss', value: 'https://example.com/feed.xml' })).toEqual(new Set());
  expect(validateSource({ type: 'site', value: 'http://example.com/page' })).toEqual(new Set());
  for (const invalid of ['', 'example.com/feed', 'ftp://example.com/feed', 42]) {
    expect(validateSource({ type: 'rss', value: invalid })).toEqual(new Set(['value']));
    expect(validateSource({ type: 'site', value: invalid })).toEqual(new Set(['value']));
  }
});

test('search 来源允许自由文本与空字符串，长度不超过 200', () => {
  expect(validateSource({ type: 'search', value: '' })).toEqual(new Set());
  expect(validateSource({ type: 'search', value: '偏技术深度的资料优先' })).toEqual(new Set());
  expect(validateSource({ type: 'search', value: 'x'.repeat(200) })).toEqual(new Set());
  expect(validateSource({ type: 'search', value: 'x'.repeat(201) })).toEqual(new Set(['value']));
  expect(validateSource({ type: 'search', value: 42 })).toEqual(new Set(['value']));
});

test('未知来源类型被拒绝', () => {
  expect(validateSource({ type: 'weixin', value: 'https://example.com' })).toEqual(
    new Set(['type']),
  );
});
