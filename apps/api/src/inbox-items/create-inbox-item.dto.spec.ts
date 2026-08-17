/** @fileoverview 验证 Inbox 创建载荷的互斥、形状与白名单校验。 */

import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { expect, test } from 'vitest';

import { INBOX_ITEM_CONTENT_MAX_LENGTH } from '@everlearn/contracts';

import { CreateInboxItemDto } from './create-inbox-item.dto';

/** 用于以正文对象执行 DTO 校验并返回出错的字段名集合。 */
function validateCreate(input: Record<string, unknown>): Set<string> {
  const errors = validateSync(plainToInstance(CreateInboxItemDto, input), {
    forbidNonWhitelisted: true,
    whitelist: true,
  });
  return new Set(errors.map((error) => error.property));
}

/** 用于断言输入整体被接受且转换后保留裁剪结果。 */
function acceptAndTrim(input: Record<string, unknown>, key: 'text' | 'url'): string {
  const instance = plainToInstance(CreateInboxItemDto, input);
  expect(validateSync(instance, { forbidNonWhitelisted: true, whitelist: true })).toEqual([]);
  return instance[key] ?? '';
}

test('accepts trimmed non-empty text as the only payload', () => {
  expect(acceptAndTrim({ text: '  一条快速记录  ' }, 'text')).toBe('一条快速记录');
});

test('accepts a single http or https url as the only payload', () => {
  expect(acceptAndTrim({ url: '  https://example.com/post?id=1#frag  ' }, 'url')).toBe(
    'https://example.com/post?id=1#frag',
  );
  expect(acceptAndTrim({ url: 'http://127.0.0.1:5433/path' }, 'url')).toBe(
    'http://127.0.0.1:5433/path',
  );
});

test('rejects payloads where both text and url appear', () => {
  expect(validateCreate({ text: '文字', url: 'https://example.com' })).toEqual(
    new Set(['text', 'url']),
  );
});

test('rejects payloads where neither text nor url appears', () => {
  expect(validateCreate({})).toEqual(new Set(['text', 'url']));
});

test('rejects blank or oversized text', () => {
  expect(validateCreate({ text: ' \t\n ' })).toEqual(new Set(['text', 'url']));
  expect(validateCreate({ text: 'x'.repeat(INBOX_ITEM_CONTENT_MAX_LENGTH + 1) })).toEqual(
    new Set(['text', 'url']),
  );
});

test('rejects urls that are not a single http or https address', () => {
  for (const url of [
    '',
    'ftp://example.com/file',
    'javascript:alert(1)',
    '/relative/path',
    'example.com/missing-scheme',
    'https://',
    'x'.repeat(INBOX_ITEM_CONTENT_MAX_LENGTH + 1),
  ]) {
    expect(validateCreate({ url })).toEqual(new Set(['text', 'url']));
  }
});

test('rejects non-string payloads and unknown ownership fields', () => {
  expect(validateCreate({ text: 42 })).toEqual(new Set(['text', 'url']));
  expect(validateCreate({ url: ['https://example.com'] })).toEqual(new Set(['text', 'url']));
  for (const extra of [{ ownerId: 'x' }, { kind: 'url' }, { status: 'pending' }]) {
    const instance = plainToInstance(CreateInboxItemDto, { text: '文字', ...extra });
    const errors = validateSync(instance, { forbidNonWhitelisted: true, whitelist: true });
    expect(errors.map((error) => error.property)).toContain(Object.keys(extra)[0] ?? '');
  }
});
