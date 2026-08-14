/** @fileoverview 校验列表查询并编码不透明知识库游标。 */

import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  type ValidationOptions,
} from 'class-validator';

const CURSOR_VERSION = 1 as const;
const MAX_CURSOR_LENGTH = 512;
const MAX_POSTGRESQL_MICROS = 9_223_372_036_854_775_807n;
const UPDATED_AT_MICROS_PATTERN = /^[1-9]\d{0,19}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const CURSOR_KEYS = ['id', 'updatedAtMicros', 'v'] as const;

/** 用于承载继续稳定排序所需的无损元组。 */
export interface KnowledgeBaseCursorPayload {
  readonly id: string;
  readonly updatedAtMicros: string;
  readonly v: typeof CURSOR_VERSION;
}

/** 用于拒绝无法安全进入 PostgreSQL bigint 边界的小数时间戳。 */
function isCanonicalUpdatedAtMicros(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    UPDATED_AT_MICROS_PATTERN.test(value) &&
    BigInt(value) <= MAX_POSTGRESQL_MICROS
  );
}

/** 用于识别规范游标载荷并拒绝额外属性。 */
function isKnowledgeBaseCursorPayload(value: unknown): value is KnowledgeBaseCursorPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  if (keys.length !== CURSOR_KEYS.length || keys.some((key, index) => key !== CURSOR_KEYS[index])) {
    return false;
  }
  return (
    candidate.v === CURSOR_VERSION &&
    isCanonicalUpdatedAtMicros(candidate.updatedAtMicros) &&
    typeof candidate.id === 'string' &&
    UUID_PATTERN.test(candidate.id)
  );
}

/** 用于按稳定 JSON 属性顺序序列化有效游标。 */
function serializeCursorPayload(payload: KnowledgeBaseCursorPayload): string {
  return JSON.stringify({ v: payload.v, updatedAtMicros: payload.updatedAtMicros, id: payload.id });
}

/** 用于编码规范且无损的列表传输游标。 */
export function encodeKnowledgeBaseCursor(payload: KnowledgeBaseCursorPayload): string {
  if (!isKnowledgeBaseCursorPayload(payload)) {
    throw new TypeError('Knowledge-base cursor payload must be canonical.');
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
export function decodeKnowledgeBaseCursor(cursor: string): KnowledgeBaseCursorPayload | undefined {
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
  if (!isKnowledgeBaseCursorPayload(payload)) return undefined;
  if (serializeCursorPayload(payload) !== json) return undefined;
  return encodeKnowledgeBaseCursor(payload) === cursor ? payload : undefined;
}

/** 用于以非抛错解码器构造 class-validator 装饰器。 */
function IsKnowledgeBaseCursor(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isKnowledgeBaseCursor',
      validator: {
        /** 用于只接受可按规范游标编解码往返的字符串。 */
        validate: (value: unknown): boolean =>
          typeof value === 'string' && decodeKnowledgeBaseCursor(value) !== undefined,
      },
    },
    validationOptions,
  );
}

/** 用于接收知识库列表的可选游标分页参数。 */
export class ListKnowledgeBasesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CURSOR_LENGTH)
  @IsKnowledgeBaseCursor()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
