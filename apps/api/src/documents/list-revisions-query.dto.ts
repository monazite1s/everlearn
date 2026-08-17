/** @fileoverview 校验修订列表查询并编码不透明游标。 */

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
const MAX_REVISION_NUMBER = 2_147_483_647;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const CURSOR_KEYS = ['revisionNumber', 'v'] as const;

/** 用于承载继续修订倒序列表所需的无损修订号。 */
export interface RevisionCursorPayload {
  readonly revisionNumber: number;
  readonly v: typeof CURSOR_VERSION;
}

/** 用于识别规范游标载荷并拒绝额外属性。 */
function isRevisionCursorPayload(value: unknown): value is RevisionCursorPayload {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  if (keys.length !== CURSOR_KEYS.length || keys.some((key, index) => key !== CURSOR_KEYS[index])) {
    return false;
  }
  return (
    candidate.v === CURSOR_VERSION &&
    typeof candidate.revisionNumber === 'number' &&
    Number.isSafeInteger(candidate.revisionNumber) &&
    candidate.revisionNumber >= 1 &&
    candidate.revisionNumber <= MAX_REVISION_NUMBER
  );
}

/** 用于按稳定 JSON 属性顺序序列化有效游标。 */
function serializeCursorPayload(payload: RevisionCursorPayload): string {
  return JSON.stringify({ revisionNumber: payload.revisionNumber, v: payload.v });
}

/** 用于编码规范且无损的修订列表传输游标。 */
export function encodeRevisionCursor(payload: RevisionCursorPayload): string {
  if (!isRevisionCursorPayload(payload)) {
    throw new TypeError('Revision cursor payload must be canonical.');
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
export function decodeRevisionCursor(cursor: string): RevisionCursorPayload | undefined {
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH || !BASE64URL_PATTERN.test(cursor)) {
    return undefined;
  }
  let json: string;
  try {
    const bytes = Buffer.from(cursor, 'base64url');
    if (bytes.toString('base64url') !== cursor) return undefined;
    json = new TextDecoder('utf8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
  const payload = parseCursorJson(json);
  if (!isRevisionCursorPayload(payload)) return undefined;
  return serializeCursorPayload(payload) !== json ? undefined : payload;
}

/** 用于以非抛错解码器构造 class-validator 装饰器。 */
function IsRevisionCursor(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isRevisionCursor',
      validator: {
        /** 用于只接受可按规范游标编解码往返的字符串。 */
        validate: (value: unknown): boolean =>
          typeof value === 'string' && decodeRevisionCursor(value) !== undefined,
      },
    },
    validationOptions,
  );
}

/** 用于接收修订列表的可选游标分页参数。 */
export class ListRevisionsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_CURSOR_LENGTH)
  @IsRevisionCursor()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
