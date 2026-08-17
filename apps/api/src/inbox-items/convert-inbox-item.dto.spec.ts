/** @fileoverview 验证 Inbox 转换载荷的目标、父级、标题与白名单校验。 */

import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { expect, test } from 'vitest';

import { ConvertInboxItemDto } from './convert-inbox-item.dto';

const knowledgeBaseId = 'c0000000-0000-4000-8000-000000000001';
const parentId = 'e0000000-0000-4000-8000-000000000002';

/** 用于以正文对象执行 DTO 校验并返回出错的字段名集合。 */
function validateConvert(input: Record<string, unknown>): Set<string> {
  const errors = validateSync(plainToInstance(ConvertInboxItemDto, input), {
    forbidNonWhitelisted: true,
    whitelist: true,
  });
  return new Set(errors.map((error) => error.property));
}

/** 用于断言输入整体被接受且转换后保留裁剪后的标题。 */
function acceptAndTrimTitle(input: Record<string, unknown>): string {
  const instance = plainToInstance(ConvertInboxItemDto, input);
  expect(validateSync(instance, { forbidNonWhitelisted: true, whitelist: true })).toEqual([]);
  return instance.title;
}

test('accepts a target knowledge base with an optional parent and trimmed title', () => {
  expect(acceptAndTrimTitle({ knowledgeBaseId, title: '  转换标题  ' })).toBe('转换标题');
  expect(acceptAndTrimTitle({ knowledgeBaseId, parentId, title: '子文档' })).toBe('子文档');
});

test('rejects missing or non-uuid target knowledge base', () => {
  expect(validateConvert({ title: '标题' })).toEqual(new Set(['knowledgeBaseId']));
  for (const invalid of ['', 'not-a-uuid', 42]) {
    expect(validateConvert({ knowledgeBaseId: invalid, title: '标题' })).toEqual(
      new Set(['knowledgeBaseId']),
    );
  }
});

test('rejects a non-uuid optional parent', () => {
  expect(validateConvert({ knowledgeBaseId, parentId: 'not-a-uuid', title: '标题' })).toEqual(
    new Set(['parentId']),
  );
});

test('rejects blank, oversized or non-string titles', () => {
  for (const title of [' \t\n ', 'x'.repeat(201), 42, undefined]) {
    expect(validateConvert({ knowledgeBaseId, title })).toEqual(new Set(['title']));
  }
});

test('accepts a title at the exact max length', () => {
  expect(validateConvert({ knowledgeBaseId, title: 'x'.repeat(200) })).toEqual(new Set());
});

test('rejects unknown ownership or result fields', () => {
  for (const extra of [{ ownerId: 'x' }, { status: 'pending' }, { convertedDocumentId: 'y' }]) {
    const instance = plainToInstance(ConvertInboxItemDto, {
      knowledgeBaseId,
      title: '标题',
      ...extra,
    });
    const errors = validateSync(instance, { forbidNonWhitelisted: true, whitelist: true });
    expect(errors.map((error) => error.property)).toContain(Object.keys(extra)[0] ?? '');
  }
});
