/** @fileoverview Validates list queries and encodes opaque knowledge-base cursors. */

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

/** Carries the exact lossless tuple used to continue stable list ordering. */
export interface KnowledgeBaseCursorPayload {
  readonly id: string;
  readonly updatedAtMicros: string;
  readonly v: typeof CURSOR_VERSION;
}

/** Rejects decimal timestamps that cannot safely enter the PostgreSQL bigint boundary. */
function isCanonicalUpdatedAtMicros(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    UPDATED_AT_MICROS_PATTERN.test(value) &&
    BigInt(value) <= MAX_POSTGRESQL_MICROS
  );
}

/** Recognizes the exact canonical cursor payload and rejects extra properties. */
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

/** Serializes an already validated cursor payload in one stable JSON property order. */
function serializeCursorPayload(payload: KnowledgeBaseCursorPayload): string {
  return JSON.stringify({ v: payload.v, updatedAtMicros: payload.updatedAtMicros, id: payload.id });
}

/** Encodes a canonical lossless list cursor for transport. */
export function encodeKnowledgeBaseCursor(payload: KnowledgeBaseCursorPayload): string {
  if (!isKnowledgeBaseCursorPayload(payload)) {
    throw new TypeError('Knowledge-base cursor payload must be canonical.');
  }
  return Buffer.from(serializeCursorPayload(payload), 'utf8').toString('base64url');
}

/** Parses JSON while keeping malformed input on the non-throwing decode path. */
function parseCursorJson(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return undefined;
  }
}

/** Decodes a canonical opaque cursor, returning undefined for every invalid input. */
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

/** Builds the class-validator decorator backed by the non-throwing cursor decoder. */
function IsKnowledgeBaseCursor(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isKnowledgeBaseCursor',
      validator: {
        /** Accepts only strings that round-trip through the canonical cursor codec. */
        validate: (value: unknown): boolean =>
          typeof value === 'string' && decodeKnowledgeBaseCursor(value) !== undefined,
      },
    },
    validationOptions,
  );
}

/** Accepts optional cursor pagination controls for knowledge-base listing. */
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
