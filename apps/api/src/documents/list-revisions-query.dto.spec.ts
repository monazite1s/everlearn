/** @fileoverview 验证修订列表查询校验与不透明游标编解码。 */

import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { expect, test } from 'vitest';

import {
  decodeRevisionCursor,
  encodeRevisionCursor,
  ListRevisionsQueryDto,
} from './list-revisions-query.dto';

/** 用于构造规范游标载荷。 */
function canonicalPayload(): { revisionNumber: number; v: 1 } {
  return { revisionNumber: 7, v: 1 };
}

/** 用于以查询对象执行 DTO 校验并返回字段错误。 */
function validateQuery(input: Record<string, unknown>): string[] {
  const errors = validateSync(plainToInstance(ListRevisionsQueryDto, input));
  return errors.map((error) => error.property);
}

test('encodes and decodes canonical revision cursors', () => {
  const cursor = encodeRevisionCursor(canonicalPayload());
  expect(decodeRevisionCursor(cursor)).toEqual(canonicalPayload());
});

test('rejects non-canonical or tampered cursors', () => {
  const invalidCursors = [
    '',
    'not-a-cursor!',
    'x'.repeat(513),
    Buffer.from('not json', 'utf8').toString('base64url'),
    Buffer.from('{"revisionNumber":0,"v":1}', 'utf8').toString('base64url'),
    Buffer.from('{"revisionNumber":1.5,"v":1}', 'utf8').toString('base64url'),
    Buffer.from('{"revisionNumber":2147483648,"v":1}', 'utf8').toString('base64url'),
    Buffer.from('{"revisionNumber":"7","v":1}', 'utf8').toString('base64url'),
    Buffer.from('{"revisionNumber":7,"v":2}', 'utf8').toString('base64url'),
    Buffer.from('{"revisionNumber":7,"v":1,"extra":1}', 'utf8').toString('base64url'),
    Buffer.from('{"v":1,"revisionNumber":7}', 'utf8').toString('base64url'),
    Buffer.from('{"revisionNumber":7,"v":1}', 'utf8').toString('base64url') + '=',
  ];
  for (const cursor of invalidCursors) expect(decodeRevisionCursor(cursor)).toBeUndefined();
});

test('rejects encoding non-canonical cursor payloads', () => {
  expect(() => encodeRevisionCursor({ revisionNumber: 0, v: 1 })).toThrow(TypeError);
  expect(() => encodeRevisionCursor({ revisionNumber: 1.5, v: 1 })).toThrow(TypeError);
});

test('validates revision list query DTO', () => {
  const valid = validateQuery({
    cursor: encodeRevisionCursor(canonicalPayload()),
    limit: 100,
  });
  expect(valid).toEqual([]);
  expect(validateQuery({})).toEqual([]);
  for (const invalid of [0, 101, 1.5, NaN]) {
    expect(validateQuery({ limit: invalid })).toEqual(['limit']);
  }
  expect(validateQuery({ cursor: 'not-a-cursor!' })).toEqual(['cursor']);
});
