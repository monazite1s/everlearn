/** @fileoverview 验证 Inbox 列表查询校验与不透明游标编解码。 */

import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { expect, test } from 'vitest';

import {
  decodeInboxItemCursor,
  encodeInboxItemCursor,
  ListInboxItemsQueryDto,
} from './list-inbox-items-query.dto';

const canonicalId = '60000000-0000-4000-8000-000000000001';

/** 用于构造规范游标载荷。 */
function canonicalPayload(): { createdAtMicros: string; id: string; v: 1 } {
  return { createdAtMicros: '1755403200000000', id: canonicalId, v: 1 };
}

/** 用于以查询对象执行 DTO 校验并返回字段错误。 */
function validateQuery(input: Record<string, unknown>): string[] {
  const errors = validateSync(plainToInstance(ListInboxItemsQueryDto, input), {
    forbidNonWhitelisted: true,
    whitelist: true,
  });
  return errors.map((error) => error.property);
}

test('encodes and decodes canonical inbox-item cursors', () => {
  const cursor = encodeInboxItemCursor(canonicalPayload());
  expect(decodeInboxItemCursor(cursor)).toEqual(canonicalPayload());
});

test('rejects non-canonical or tampered cursors', () => {
  const invalidCursors = [
    '',
    'not-a-cursor!',
    'x'.repeat(513),
    Buffer.from('not json', 'utf8').toString('base64url'),
    Buffer.from('{"createdAtMicros":"0","id":"' + canonicalId + '","v":1}', 'utf8').toString(
      'base64url',
    ),
    Buffer.from(
      '{"createdAtMicros":"1755403200000000.5","id":"' + canonicalId + '","v":1}',
      'utf8',
    ).toString('base64url'),
    Buffer.from(
      '{"createdAtMicros":"9223372036854775808","id":"' + canonicalId + '","v":1}',
      'utf8',
    ).toString('base64url'),
    Buffer.from('{"createdAtMicros":"1","id":"not-a-uuid","v":1}', 'utf8').toString('base64url'),
    Buffer.from('{"createdAtMicros":"1","id":"' + canonicalId + '","v":2}', 'utf8').toString(
      'base64url',
    ),
    Buffer.from(
      '{"createdAtMicros":"1","id":"' + canonicalId + '","v":1,"extra":1}',
      'utf8',
    ).toString('base64url'),
    Buffer.from('{"id":"' + canonicalId + '","createdAtMicros":"1","v":1}', 'utf8').toString(
      'base64url',
    ),
    Buffer.from('{"createdAtMicros":"1","id":"' + canonicalId + '","v":1}', 'utf8').toString(
      'base64url',
    ) + '=',
  ];
  for (const cursor of invalidCursors) expect(decodeInboxItemCursor(cursor)).toBeUndefined();
});

test('rejects encoding non-canonical cursor payloads', () => {
  expect(() => encodeInboxItemCursor({ ...canonicalPayload(), createdAtMicros: '0' })).toThrow(
    TypeError,
  );
  expect(() => encodeInboxItemCursor({ ...canonicalPayload(), id: 'bad' })).toThrow(TypeError);
});

test('validates inbox-item list query DTO', () => {
  const valid = validateQuery({
    cursor: encodeInboxItemCursor(canonicalPayload()),
    limit: 100,
  });
  expect(valid).toEqual([]);
  expect(validateQuery({})).toEqual([]);
  expect(validateQuery({ limit: 20 })).toEqual([]);
  expect(validateQuery({ limit: 0 })).toEqual(['limit']);
  expect(validateQuery({ limit: 101 })).toEqual(['limit']);
  expect(validateQuery({ limit: 'invalid' })).toEqual(['limit']);
  expect(validateQuery({ cursor: 'garbage' })).toEqual(['cursor']);
  expect(validateQuery({ unexpected: 'field' })).toEqual(['unexpected']);
});
