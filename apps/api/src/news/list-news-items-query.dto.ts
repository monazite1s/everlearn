/**
 * @fileoverview 校验资讯条目流查询并编码按重要性、发现时间倒序的不透明游标。
 */

import { createHash } from 'node:crypto';

import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  type ValidationOptions,
} from 'class-validator';

const CURSOR_VERSION = 2 as const;
const MAX_CURSOR_LENGTH = 512;
const MAX_POSTGRESQL_MICROS = 9_223_372_036_854_775_807n;
const DISCOVERED_AT_MICROS_PATTERN = /^[1-9]\d{0,19}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const CURSOR_KEYS = ['discoveredAtMicros', 'f', 'id', 'importance', 'v'] as const;

/** 用于承载条目流按重要性、发现时间倒序续页的无损元组。 */
export interface NewsItemsCursorPayload {
  readonly discoveredAtMicros: string;
  /** 过滤条件指纹，跨过滤游标一律拒绝。 */
  readonly f: string;
  readonly id: string;
  readonly importance: 'high' | 'low' | 'normal';
  readonly v: typeof CURSOR_VERSION;
}

/** 用于拒绝无法安全进入 PostgreSQL bigint 边界的小数时间戳。 */
function isCanonicalMicros(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    DISCOVERED_AT_MICROS_PATTERN.test(value) &&
    BigInt(value) <= MAX_POSTGRESQL_MICROS
  );
}

/** 用于校验游标载荷中的重要性档位。 */
function isCursorImportance(value: unknown): value is NewsItemsCursorPayload['importance'] {
  return value === 'high' || value === 'low' || value === 'normal';
}

/** 用于识别规范游标载荷并拒绝额外属性。 */
function isNewsItemsCursorPayload(value: unknown): value is NewsItemsCursorPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  if (keys.length !== CURSOR_KEYS.length || keys.some((key, index) => key !== CURSOR_KEYS[index])) {
    return false;
  }
  if (candidate.v !== CURSOR_VERSION || !isCanonicalMicros(candidate.discoveredAtMicros)) {
    return false;
  }
  if (typeof candidate.id !== 'string' || typeof candidate.f !== 'string') return false;
  return isCursorImportance(candidate.importance);
}

/** 用于按稳定 JSON 属性顺序序列化有效游标。 */
function serializeCursorPayload(payload: NewsItemsCursorPayload): string {
  return JSON.stringify({
    discoveredAtMicros: payload.discoveredAtMicros,
    f: payload.f,
    id: payload.id,
    importance: payload.importance,
    v: payload.v,
  });
}

/** 用于把过滤条件收敛为稳定指纹（跨过滤游标据此被拒绝）。 */
export function newsItemsFilterFingerprint(filters: {
  importance?: string | undefined;
  sourceType?: string | undefined;
  subscriptionId?: string | undefined;
}): string {
  const raw = [
    filters.subscriptionId ?? '',
    filters.sourceType ?? '',
    filters.importance ?? '',
  ].join('\u0000');
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

/** 用于编码规范且无损的条目流传输游标。 */
export function encodeNewsItemsCursor(payload: NewsItemsCursorPayload): string {
  if (!isNewsItemsCursorPayload(payload)) {
    throw new TypeError('News items cursor payload must be canonical.');
  }
  return Buffer.from(serializeCursorPayload(payload), 'utf8').toString('base64url');
}

/** 用于解析 JSON 并让非法输入保持非抛错解码路径。 */
function parseCursorJson(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return undefined;
  }
}

/** 用于解码规范不透明游标，非法输入统一返回 undefined。 */
export function decodeNewsItemsCursor(cursor: string): NewsItemsCursorPayload | undefined {
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH || !BASE64URL_PATTERN.test(cursor)) {
    return undefined;
  }
  let json: string;
  try {
    const bytes = Buffer.from(cursor, 'base64url');
    if (bytes.toString('base64url') !== cursor) return undefined;
    json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
  const payload = parseCursorJson(json);
  if (!isNewsItemsCursorPayload(payload)) return undefined;
  return serializeCursorPayload(payload) !== json ? undefined : payload;
}

/** 用于以非抛错解码器构造 class-validator 装饰器。 */
function IsNewsItemsCursor(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isNewsItemsCursor',
      validator: {
        /** 用于只接受可按规范游标编解码往返的字符串。 */
        validate: (value: unknown): boolean =>
          typeof value === 'string' && decodeNewsItemsCursor(value) !== undefined,
      },
    },
    validationOptions,
  );
}

/** 用于接收条目流的可选过滤与游标分页参数。 */
export class ListNewsItemsQueryDto {
  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  @IsOptional()
  @IsIn(['rss', 'search'])
  sourceType?: 'rss' | 'search';

  @IsOptional()
  @IsIn(['high', 'normal', 'low'])
  importance?: 'high' | 'low' | 'normal';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  // ponytail: 上限与 packages/contracts 的 NEWS_ITEMS_MAX_LIMIT 同值；CJS 装饰器无法值导入 ESM 契约，升级条件为 API 转 ESM。
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_CURSOR_LENGTH)
  @IsNewsItemsCursor()
  cursor?: string;
}
