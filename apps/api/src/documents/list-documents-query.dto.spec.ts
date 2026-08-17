/** @fileoverview 验证文档子节点查询校验与不透明游标编解码。 */

import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { expect, test } from 'vitest';

import {
  decodeDocumentCursor,
  encodeDocumentCursor,
  ListDocumentsQueryDto,
} from './list-documents-query.dto';

const canonicalId = '30000000-0000-4000-8000-000000000001';

/** 用于构造规范游标载荷。 */
function canonicalPayload(): { id: string; position: string; v: 1 } {
  return { id: canonicalId, position: '1024', v: 1 };
}

/** 用于以查询对象执行 DTO 校验并返回字段错误。 */
function validateQuery(input: Record<string, unknown>): string[] {
  const errors = validateSync(plainToInstance(ListDocumentsQueryDto, input));
  return errors.map((error) => error.property);
}

test('encodes and decodes canonical document cursors', () => {
  const cursor = encodeDocumentCursor(canonicalPayload());
  expect(decodeDocumentCursor(cursor)).toEqual(canonicalPayload());
});

test('rejects non-canonical or tampered cursors', () => {
  const invalidCursors = [
    '',
    'not-a-cursor!',
    'x'.repeat(513),
    Buffer.from('not json', 'utf8').toString('base64url'),
    Buffer.from(
      '{"id":"30000000-0000-4000-8000-000000000001","position":"-1","v":1}',
      'utf8',
    ).toString('base64url'),
    Buffer.from(
      '{"id":"30000000-0000-4000-8000-000000000001","position":"1.5","v":1}',
      'utf8',
    ).toString('base64url'),
    Buffer.from(
      `{"id":"30000000-0000-4000-8000-000000000001","position":"9223372036854775808","v":1}`,
      'utf8',
    ).toString('base64url'),
    Buffer.from('{"id":"not-a-uuid","position":"0","v":1}', 'utf8').toString('base64url'),
    Buffer.from(
      '{"id":"30000000-0000-4000-8000-000000000001","position":"0","v":2}',
      'utf8',
    ).toString('base64url'),
    Buffer.from(
      '{"id":"30000000-0000-4000-8000-000000000001","position":"0","v":1,"extra":1}',
      'utf8',
    ).toString('base64url'),
    Buffer.from(
      '{"position":"0","id":"30000000-0000-4000-8000-000000000001","v":1}',
      'utf8',
    ).toString('base64url'),
    Buffer.from(
      '{"id":"30000000-0000-4000-8000-000000000001","position":"0","v":1}',
      'utf8',
    ).toString('base64url') + '=',
  ];
  for (const cursor of invalidCursors) expect(decodeDocumentCursor(cursor)).toBeUndefined();
});

test('rejects encoding non-canonical cursor payloads', () => {
  expect(() => encodeDocumentCursor({ id: canonicalId, position: '-1', v: 1 })).toThrow(TypeError);
  expect(() => encodeDocumentCursor({ id: 'bad', position: '0', v: 1 })).toThrow(TypeError);
});

test('validates document list query DTO', () => {
  const valid = validateQuery({
    cursor: encodeDocumentCursor(canonicalPayload()),
    limit: 100,
    parentId: canonicalId,
  });
  expect(valid).toEqual([]);
  expect(validateQuery({})).toEqual([]);
  expect(validateQuery({ limit: 1 })).toEqual([]);
  expect(validateQuery({ limit: 0 })).toEqual(['limit']);
  expect(validateQuery({ limit: 101 })).toEqual(['limit']);
  expect(validateQuery({ limit: 'invalid' })).toEqual(['limit']);
  expect(validateQuery({ parentId: 'not-a-uuid' })).toEqual(['parentId']);
  expect(validateQuery({ cursor: 'garbage' })).toEqual(['cursor']);
});
