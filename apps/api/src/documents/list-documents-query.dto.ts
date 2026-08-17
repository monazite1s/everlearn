/** @fileoverview 校验直接子节点列表查询并编码不透明游标。 */

import { Type } from 'class-transformer';
import {
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

const CURSOR_VERSION = 1 as const;
const MAX_CURSOR_LENGTH = 512;
const MAX_POSTGRESQL_BIGINT = 9_223_372_036_854_775_807n;
const POSITION_PATTERN = /^(0|[1-9]\d*)$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const CURSOR_KEYS = ['id', 'position', 'v'] as const;

/** 用于承载继续稳定排序所需的无损位置元组。 */
export interface DocumentCursorPayload {
  readonly id: string;
  readonly position: string;
  readonly v: typeof CURSOR_VERSION;
}

/** 用于拒绝无法安全进入 PostgreSQL bigint 边界的排序值。 */
function isCanonicalPosition(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    POSITION_PATTERN.test(value) &&
    BigInt(value) <= MAX_POSTGRESQL_BIGINT
  );
}

/** 用于识别规范游标载荷并拒绝额外属性。 */
function isDocumentCursorPayload(value: unknown): value is DocumentCursorPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  if (keys.length !== CURSOR_KEYS.length || keys.some((key, index) => key !== CURSOR_KEYS[index])) {
    return false;
  }
  return (
    candidate.v === CURSOR_VERSION &&
    isCanonicalPosition(candidate.position) &&
    typeof candidate.id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(candidate.id)
  );
}

/** 用于按稳定 JSON 属性顺序序列化有效游标。 */
function serializeCursorPayload(payload: DocumentCursorPayload): string {
  return JSON.stringify({ id: payload.id, position: payload.position, v: payload.v });
}

/** 用于编码规范且无损的子节点列表传输游标。 */
export function encodeDocumentCursor(payload: DocumentCursorPayload): string {
  if (!isDocumentCursorPayload(payload)) {
    throw new TypeError('Document cursor payload must be canonical.');
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
export function decodeDocumentCursor(cursor: string): DocumentCursorPayload | undefined {
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
  if (!isDocumentCursorPayload(payload)) return undefined;
  if (serializeCursorPayload(payload) !== json) return undefined;
  return payload;
}

/** 用于以非抛错解码器构造 class-validator 装饰器。 */
function IsDocumentCursor(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isDocumentCursor',
      validator: {
        /** 用于只接受可按规范游标编解码往返的字符串。 */
        validate: (value: unknown): boolean =>
          typeof value === 'string' && decodeDocumentCursor(value) !== undefined,
      },
    },
    validationOptions,
  );
}

/** 用于接收文档直接子节点列表的父节点与游标分页参数。 */
export class ListDocumentsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CURSOR_LENGTH)
  @IsDocumentCursor()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsUUID()
  parentId?: string;
}
