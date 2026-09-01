/** @fileoverview 校验全局搜索查询并编码绑定筛选元组的规范 keyset 游标。 */

import { createHash } from 'node:crypto';

import type { SearchField, SearchRequestQuery, SearchScope } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  type ValidationArguments,
} from 'class-validator';

const CURSOR_VERSION = 1 as const;
// 以下边界与共享契约常量保持一致，API 的 CommonJS 运行时不加载 ESM 契约值。
const SEARCH_CURSOR_MAX_LENGTH = 512;
const SEARCH_MAX_LIMIT = 100;
const SEARCH_QUERY_MAX_LENGTH = 200;
const SEARCH_SCOPES = ['all', 'knowledgeBase'] as const;
const SEARCH_FIELDS = ['all', 'title', 'content'] as const;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const HASH_PATTERN = /^[0-9a-f]{64}$/u;
const SCORE_PATTERN = /^(?:0|[1-9]\d{0,19})\.\d{6}$/u;
const MICROS_PATTERN = /^(?:0|[1-9]\d{0,18})$/u;
const MAX_POSTGRESQL_MICROS = 9_223_372_036_854_775_807n;
const UTC_TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?Z$/u;
const CURSOR_KEYS = [
  'documentId',
  'fingerprint',
  'rankScore',
  'rankTier',
  'updatedAtMicros',
  'v',
] as const;

/** 用于承载固定排序继续读取所需的完整无损元组。 */
export interface SearchCursorPayload {
  readonly documentId: string;
  readonly fingerprint: string;
  readonly rankScore: string;
  readonly rankTier: number;
  readonly updatedAtMicros: string;
  readonly v: typeof CURSOR_VERSION;
}

/** 用于形成搜索执行和游标指纹共用的规范筛选元组。 */
export interface NormalizedSearchQuery {
  readonly field: SearchField;
  readonly fingerprint: string;
  readonly knowledgeBaseId: string | null;
  readonly query: string;
  readonly scope: SearchScope;
  readonly updatedAfter: string | null;
}

interface UtcTimestampParts {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly month: number;
  readonly second: number;
  readonly year: number;
}

/** 用于按稳定属性顺序计算不含 limit 与 cursor 的查询指纹。 */
function fingerprintQuery(tuple: Omit<NormalizedSearchQuery, 'fingerprint'>): string {
  return createHash('sha256').update(JSON.stringify(tuple), 'utf8').digest('hex');
}

/** 用于把已通过 HTTP 校验的输入折叠为大小写不敏感的稳定元组。 */
export function normalizeSearchQuery(input: SearchRequestQuery): NormalizedSearchQuery {
  const tuple = {
    field: input.field ?? 'all',
    knowledgeBaseId: input.knowledgeBaseId ?? null,
    query: input.query.trim().toLowerCase(),
    scope: input.scope ?? 'all',
    updatedAfter: input.updatedAfter ?? null,
  } satisfies Omit<NormalizedSearchQuery, 'fingerprint'>;
  return { ...tuple, fingerprint: fingerprintQuery(tuple) };
}

/** 用于从严格 Z 结尾格式解析 UTC 日期时间字段。 */
function parseUtcTimestamp(value: unknown): UtcTimestampParts | undefined {
  if (typeof value !== 'string') return undefined;
  const match = UTC_TIMESTAMP_PATTERN.exec(value);
  if (match === null) return undefined;
  return {
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    month: Number(match[2]),
    second: Number(match[6]),
    year: Number(match[1]),
  };
}

/** 用于拒绝超出普通 UTC 日历和时钟范围的字段。 */
function hasValidUtcFields(parts: UtcTimestampParts): boolean {
  return (
    parts.hour <= 23 &&
    parts.minute <= 59 &&
    parts.second <= 59 &&
    parts.month >= 1 &&
    parts.month <= 12 &&
    parts.day >= 1
  );
}

/** 用于拒绝日期溢出、非 UTC 或非 RFC 3339 的更新时间。 */
function isUtcTimestamp(value: unknown): value is string {
  const parts = parseUtcTimestamp(value);
  if (parts === undefined || !hasValidUtcFields(parts)) return false;
  const date = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
  );
  return (
    date.getUTCFullYear() === parts.year &&
    date.getUTCMonth() === parts.month - 1 &&
    date.getUTCDate() === parts.day
  );
}

/** 用于验证知识库标识只在当前库范围出现且必填。 */
function hasValidKnowledgeBaseScope(value: unknown, object: SearchQueryDto): boolean {
  const scope = object.scope ?? 'all';
  return scope === 'knowledgeBase'
    ? typeof value === 'string' && UUID_PATTERN.test(value)
    : value === undefined;
}

/** 用于拒绝游标缺失、重复语义或未知载荷字段。 */
function hasExactCursorKeys(row: Record<string, unknown>): boolean {
  const keys = Object.keys(row).sort();
  return (
    keys.length === CURSOR_KEYS.length && keys.every((key, index) => key === CURSOR_KEYS[index])
  );
}

/** 用于验证游标相关度层级和六位小数分值。 */
function hasValidCursorRanking(row: Record<string, unknown>): boolean {
  return (
    row.v === CURSOR_VERSION &&
    Number.isInteger(row.rankTier) &&
    Number(row.rankTier) >= 1 &&
    Number(row.rankTier) <= 6 &&
    typeof row.rankScore === 'string' &&
    SCORE_PATTERN.test(row.rankScore)
  );
}

/** 用于验证游标时间与文档位置不会使 PostgreSQL 类型溢出。 */
function hasValidCursorPosition(row: Record<string, unknown>): boolean {
  return (
    typeof row.updatedAtMicros === 'string' &&
    MICROS_PATTERN.test(row.updatedAtMicros) &&
    BigInt(row.updatedAtMicros) <= MAX_POSTGRESQL_MICROS &&
    typeof row.documentId === 'string' &&
    UUID_PATTERN.test(row.documentId)
  );
}

/** 用于识别无额外字段且数值边界明确的游标载荷。 */
function isSearchCursorPayload(value: unknown): value is SearchCursorPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return (
    hasExactCursorKeys(row) &&
    hasValidCursorRanking(row) &&
    hasValidCursorPosition(row) &&
    typeof row.fingerprint === 'string' &&
    HASH_PATTERN.test(row.fingerprint)
  );
}

/** 用于按唯一规范 JSON 顺序序列化搜索游标。 */
function serializeSearchCursor(payload: SearchCursorPayload): string {
  return JSON.stringify({
    v: payload.v,
    rankTier: payload.rankTier,
    rankScore: payload.rankScore,
    updatedAtMicros: payload.updatedAtMicros,
    documentId: payload.documentId,
    fingerprint: payload.fingerprint,
  });
}

/** 用于编码服务端生成的规范且查询绑定的搜索游标。 */
export function encodeSearchCursor(payload: SearchCursorPayload): string {
  if (!isSearchCursorPayload(payload)) throw new TypeError('Search cursor payload is invalid.');
  return Buffer.from(serializeSearchCursor(payload), 'utf8').toString('base64url');
}

/** 用于解码规范 Base64URL 搜索游标而不向 HTTP 边界抛错。 */
export function decodeSearchCursor(cursor: string): SearchCursorPayload | undefined {
  if (
    cursor.length === 0 ||
    cursor.length > SEARCH_CURSOR_MAX_LENGTH ||
    !BASE64URL_PATTERN.test(cursor)
  )
    return undefined;
  try {
    const bytes = Buffer.from(cursor, 'base64url');
    if (bytes.toString('base64url') !== cursor) return undefined;
    const json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const parsed = JSON.parse(json) as unknown;
    if (!isSearchCursorPayload(parsed) || serializeSearchCursor(parsed) !== json) return undefined;
    return encodeSearchCursor(parsed) === cursor ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** 用于确认游标与当前规范查询指纹一致。 */
function cursorMatchesQuery(value: unknown, object: SearchQueryDto): boolean {
  if (value === undefined) return true;
  if (typeof value !== 'string' || typeof object.query !== 'string') return false;
  const payload = decodeSearchCursor(value);
  if (payload === undefined) return false;
  return payload.fingerprint === normalizeSearchQuery(object).fingerprint;
}

/** 用于接收全局搜索的严格公开查询参数。 */
export class SearchQueryDto implements SearchRequestQuery {
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_CURSOR_MAX_LENGTH)
  @ValidateBy({
    name: 'isBoundSearchCursor',
    validator: {
      /** 用于让畸形或跨查询游标统一归属 cursor 字段。 */
      validate(value: unknown, args: ValidationArguments): boolean {
        return cursorMatchesQuery(value, args.object as SearchQueryDto);
      },
    },
  })
  cursor?: string;

  @IsOptional()
  @IsIn(SEARCH_FIELDS)
  field?: SearchField;

  @ValidateBy({
    name: 'isKnowledgeBaseScope',
    validator: {
      /** 用于把跨字段范围组合错误统一归属知识库标识。 */
      validate(value: unknown, args: ValidationArguments): boolean {
        return hasValidKnowledgeBaseScope(value, args.object as SearchQueryDto);
      },
    },
  })
  knowledgeBaseId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(SEARCH_MAX_LIMIT)
  limit?: number;

  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(SEARCH_QUERY_MAX_LENGTH)
  @ValidateBy({
    name: 'isPresentSearchQuery',
    validator: {
      /** 用于拒绝裁剪后为空的搜索文本。 */
      validate(value: unknown): boolean {
        return typeof value === 'string' && value.length > 0;
      },
    },
  })
  query!: string;

  @IsOptional()
  @IsIn(SEARCH_SCOPES)
  scope?: SearchScope;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @ValidateBy({
    name: 'isUtcSearchTimestamp',
    validator: {
      /** 用于拒绝非 UTC、溢出日期或非 RFC 3339 时间。 */
      validate(value: unknown): boolean {
        return isUtcTimestamp(value);
      },
    },
  })
  updatedAfter?: string;
}
