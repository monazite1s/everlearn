/** @fileoverview 验证回收站查询校验与不透明游标编解码。 */

import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { expect, test } from 'vitest';

import { decodeTrashCursor, encodeTrashCursor, ListTrashQueryDto } from './list-trash-query.dto';

const canonicalId = '30000000-0000-4000-8000-000000000001';

/** 用于构造规范游标载荷。 */
function canonicalPayload(): { deletedAtMicros: string; id: string; v: 1 } {
  return { deletedAtMicros: '1786857600000000', id: canonicalId, v: 1 };
}

/** 用于以查询对象执行 DTO 校验并返回字段错误。 */
function validateQuery(input: Record<string, unknown>): string[] {
  const errors = validateSync(plainToInstance(ListTrashQueryDto, input));
  return errors.map((error) => error.property);
}

test('encodes and decodes canonical trash cursors', () => {
  const cursor = encodeTrashCursor(canonicalPayload());
  expect(decodeTrashCursor(cursor)).toEqual(canonicalPayload());
});

test('rejects non-canonical or tampered cursors', () => {
  const canonical = canonicalPayload();
  const invalidCursors = [
    '',
    'not-a-cursor!',
    'x'.repeat(513),
    Buffer.from('not json', 'utf8').toString('base64url'),
    Buffer.from(`{"deletedAtMicros":"-1","id":"${canonicalId}","v":1}`, 'utf8').toString(
      'base64url',
    ),
    Buffer.from(`{"deletedAtMicros":"1.5","id":"${canonicalId}","v":1}`, 'utf8').toString(
      'base64url',
    ),
    Buffer.from(
      `{"deletedAtMicros":"9223372036854775808","id":"${canonicalId}","v":1}`,
      'utf8',
    ).toString('base64url'),
    Buffer.from(`{"deletedAtMicros":"0","id":"${canonicalId}","v":1}`, 'utf8').toString(
      'base64url',
    ),
    Buffer.from(
      `{"deletedAtMicros":"${canonical.deletedAtMicros}","id":"not-a-uuid","v":1}`,
      'utf8',
    ).toString('base64url'),
    Buffer.from(
      `{"deletedAtMicros":"${canonical.deletedAtMicros}","id":"${canonicalId}","v":2}`,
      'utf8',
    ).toString('base64url'),
    Buffer.from(
      `{"deletedAtMicros":"${canonical.deletedAtMicros}","id":"${canonicalId}","v":1,"extra":1}`,
      'utf8',
    ).toString('base64url'),
  ];
  for (const cursor of invalidCursors) expect(decodeTrashCursor(cursor)).toBeUndefined();
});

test('rejects encoding non-canonical cursor payloads', () => {
  expect(() => encodeTrashCursor({ deletedAtMicros: '-1', id: canonicalId, v: 1 })).toThrow(
    TypeError,
  );
  expect(() => encodeTrashCursor({ deletedAtMicros: '0', id: 'bad', v: 1 })).toThrow(TypeError);
});

test('validates trash list query DTO', () => {
  const valid = validateQuery({
    cursor: encodeTrashCursor(canonicalPayload()),
    limit: 100,
  });
  expect(valid).toEqual([]);
  expect(validateQuery({})).toEqual([]);
  expect(validateQuery({ limit: 1 })).toEqual([]);
  expect(validateQuery({ limit: 0 })).toEqual(['limit']);
  expect(validateQuery({ limit: 101 })).toEqual(['limit']);
  expect(validateQuery({ limit: 'invalid' })).toEqual(['limit']);
  expect(validateQuery({ cursor: 'garbage' })).toEqual(['cursor']);
});
