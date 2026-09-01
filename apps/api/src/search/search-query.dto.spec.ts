/** @fileoverview 验证公开搜索参数组合、UTC 时间与查询绑定游标的边界。 */

import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, test } from 'vitest';

import {
  encodeSearchCursor,
  normalizeSearchQuery,
  SearchQueryDto,
  type SearchCursorPayload,
} from './search-query.dto';

const knowledgeBaseId = '51000000-0000-4000-8000-000000000001';
const documentId = '51000000-0000-4000-8000-000000000002';

/** 用于返回 DTO 校验失败字段而不绑定具体文案。 */
async function invalidFields(input: object): Promise<string[]> {
  const dto = plainToInstance(SearchQueryDto, input);
  return (await validate(dto)).map(({ property }) => property).sort();
}

/** 用于构造绑定规范查询的有效 keyset 游标。 */
function cursorFor(input: SearchQueryDto): string {
  const normalized = normalizeSearchQuery(input);
  const payload: SearchCursorPayload = {
    documentId,
    fingerprint: normalized.fingerprint,
    rankScore: '0.123456',
    rankTier: 4,
    updatedAtMicros: '1787587200000000',
    v: 1,
  };
  return encodeSearchCursor(payload);
}

/** 用于验证服务端拒绝会溢出 PostgreSQL 数值边界的伪造元组。 */
function rejectsOversizedCursorNumbers(): void {
  const fingerprint = normalizeSearchQuery(
    plainToInstance(SearchQueryDto, { query: 'x' }),
  ).fingerprint;
  const base: SearchCursorPayload = {
    documentId,
    fingerprint,
    rankScore: '0.123456',
    rankTier: 4,
    updatedAtMicros: '1787587200000000',
    v: 1,
  };
  expect(() => encodeSearchCursor({ ...base, updatedAtMicros: '9'.repeat(30) })).toThrow();
  expect(() => encodeSearchCursor({ ...base, rankScore: `${'9'.repeat(30)}.000000` })).toThrow();
}

/** 用于验证裁剪、默认值与合法范围形成单一规范元组。 */
async function acceptsCanonicalQuery(): Promise<void> {
  const dto = plainToInstance(SearchQueryDto, { query: '  OutBox  ' });
  expect(await validate(dto)).toEqual([]);
  expect(normalizeSearchQuery(dto)).toMatchObject({
    field: 'all',
    knowledgeBaseId: null,
    query: 'outbox',
    scope: 'all',
    updatedAfter: null,
  });
}

/** 用于验证范围组合和公开数值边界都在 HTTP 入口拒绝。 */
async function rejectsInvalidParameters(): Promise<void> {
  expect(await invalidFields({ query: '   ' })).toContain('query');
  expect(await invalidFields({ query: 'x'.repeat(201) })).toContain('query');
  expect(await invalidFields({ knowledgeBaseId, query: 'x', scope: 'all' })).toContain(
    'knowledgeBaseId',
  );
  expect(await invalidFields({ query: 'x', scope: 'knowledgeBase' })).toContain('knowledgeBaseId');
  expect(
    await invalidFields({ knowledgeBaseId: 'invalid', query: 'x', scope: 'knowledgeBase' }),
  ).toContain('knowledgeBaseId');
  expect(await invalidFields({ field: 'tags', query: 'x' })).toContain('field');
  expect(await invalidFields({ limit: 0, query: 'x' })).toContain('limit');
  expect(await invalidFields({ limit: 101, query: 'x' })).toContain('limit');
}

/** 用于验证更新时间只接受真实且带 Z 的 UTC RFC 3339 时间。 */
async function validatesUtcUpdatedAfter(): Promise<void> {
  expect(await invalidFields({ query: 'x', updatedAfter: '2026-08-25T12:34:56.123Z' })).toEqual([]);
  expect(await invalidFields({ query: 'x', updatedAfter: '2026-08-25T12:34:56+08:00' })).toContain(
    'updatedAfter',
  );
  expect(await invalidFields({ query: 'x', updatedAfter: '2026-02-30T12:34:56Z' })).toContain(
    'updatedAfter',
  );
}

/** 用于列出必须使查询指纹失配的各个筛选变化。 */
function changedCursorQueries(cursor: string): readonly object[] {
  const shared = {
    cursor,
    field: 'title',
    knowledgeBaseId,
    query: 'outbox',
    scope: 'knowledgeBase',
  };
  return [
    { ...shared, field: 'content', updatedAfter: '2026-08-25T00:00:00Z' },
    { ...shared, query: 'changed', updatedAfter: '2026-08-25T00:00:00Z' },
    {
      ...shared,
      knowledgeBaseId: '51000000-0000-4000-8000-000000000099',
      updatedAfter: '2026-08-25T00:00:00Z',
    },
    { ...shared, updatedAfter: '2026-08-24T00:00:00Z' },
    { cursor, field: 'title', query: 'outbox', scope: 'all' },
  ];
}

/** 用于验证游标只能在同一规范查询和筛选元组下继续。 */
async function bindsCursorToNormalizedQuery(): Promise<void> {
  const first = plainToInstance(SearchQueryDto, {
    field: 'title',
    knowledgeBaseId,
    query: '  OUTBOX ',
    scope: 'knowledgeBase',
    updatedAfter: '2026-08-25T00:00:00Z',
  });
  expect(await validate(first)).toEqual([]);
  const cursor = cursorFor(first);
  const equivalent = plainToInstance(SearchQueryDto, {
    cursor,
    field: 'title',
    knowledgeBaseId,
    limit: 99,
    query: 'outbox',
    scope: 'knowledgeBase',
    updatedAfter: '2026-08-25T00:00:00Z',
  });
  expect(await validate(equivalent)).toEqual([]);
  for (const changed of changedCursorQueries(cursor))
    expect(await invalidFields(changed)).toContain('cursor');
  expect(await invalidFields({ cursor: `${cursor}=`, query: 'outbox' })).toContain('cursor');
}

describe('SearchQueryDto', () => {
  test('accepts a canonical query', acceptsCanonicalQuery);
  test('rejects invalid parameters', rejectsInvalidParameters);
  test('validates UTC updatedAfter', validatesUtcUpdatedAfter);
  test('binds a cursor to its normalized query', bindsCursorToNormalizedQuery);
  test('rejects oversized cursor numbers', rejectsOversizedCursorNumbers);
});
