/** @fileoverview 校验回收站列表查询并编码不透明游标。 */

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
const DELETED_AT_MICROS_PATTERN = /^[1-9]\d{0,19}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const CURSOR_KEYS = ['deletedAtMicros', 'id', 'v'] as const;

/** 用于承载继续回收站稳定排序所需的无损元组。 */
export interface TrashCursorPayload {
  readonly deletedAtMicros: string;
  readonly id: string;
  readonly v: typeof CURSOR_VERSION;
}

/** 用于拒绝无法安全进入 PostgreSQL bigint 边界的小数时间戳。 */
function isCanonicalDeletedAtMicros(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    DELETED_AT_MICROS_PATTERN.test(value) &&
    BigInt(value) <= MAX_POSTGRESQL_MICROS
  );
}

/** 用于识别规范游标载荷并拒绝额外属性。 */
function isTrashCursorPayload(value: unknown): value is TrashCursorPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  if (keys.length !== CURSOR_KEYS.length || keys.some((key, index) => key !== CURSOR_KEYS[index])) {
    return false;
  }
  return (
    candidate.v === CURSOR_VERSION &&
    isCanonicalDeletedAtMicros(candidate.deletedAtMicros) &&
    typeof candidate.id === 'string' &&
    UUID_PATTERN.test(candidate.id)
  );
}

/** 用于按稳定 JSON 属性顺序序列化有效游标。 */
function serializeCursorPayload(payload: TrashCursorPayload): string {
  return JSON.stringify({
    deletedAtMicros: payload.deletedAtMicros,
    id: payload.id,
    v: payload.v,
  });
}

/** 用于编码规范且无损的回收站列表传输游标。 */
export function encodeTrashCursor(payload: TrashCursorPayload): string {
  if (!isTrashCursorPayload(payload)) {
    throw new TypeError('Trash cursor payload must be canonical.');
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
export function decodeTrashCursor(cursor: string): TrashCursorPayload | undefined {
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
  if (!isTrashCursorPayload(payload)) return undefined;
  return serializeCursorPayload(payload) !== json ? undefined : payload;
}

/** 用于以非抛错解码器构造 class-validator 装饰器。 */
function IsTrashCursor(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isTrashCursor',
      validator: {
        /** 用于只接受可按规范游标编解码往返的字符串。 */
        validate: (value: unknown): boolean =>
          typeof value === 'string' && decodeTrashCursor(value) !== undefined,
      },
    },
    validationOptions,
  );
}

/** 用于接收回收站列表的可选游标分页参数。 */
export class ListTrashQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CURSOR_LENGTH)
  @IsTrashCursor()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
