/** @fileoverview Validates and normalizes HTTP input for knowledge-base creation. */

import type { CreateKnowledgeBaseRequest } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Transform } from 'class-transformer';
import { IsString, Length, MaxLength, ValidateIf } from 'class-validator';

/** Trims string inputs while leaving other values available for type validation. */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Runs optional-field validation for every supplied value, including null. */
function isSupplied(_object: object, value: unknown): boolean {
  return value !== undefined;
}

/** Accepts the editable fields for creating a normal knowledge base. */
export class CreateKnowledgeBaseDto implements CreateKnowledgeBaseRequest {
  @Transform(trimString)
  @ValidateIf(isSupplied)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Transform(trimString)
  @IsString()
  @Length(1, 200)
  name!: string;
}
