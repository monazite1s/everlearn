/** @fileoverview Validates an optimistic knowledge-base metadata update. */

import type { UpdateKnowledgeBaseRequest } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsString,
  Length,
  MaxLength,
  Min,
  registerDecorator,
  ValidateIf,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/** Trims string inputs while preserving non-strings for explicit type validation. */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** Runs optional-field validation for every supplied value, including null. */
function isSupplied(_object: object, value: unknown): boolean {
  return value !== undefined;
}

/** Returns whether an update includes at least one user-editable field. */
function hasEditableField(_value: unknown, args: ValidationArguments): boolean {
  const input = args.object as Partial<UpdateKnowledgeBaseRequest>;
  return input.name !== undefined || input.description !== undefined;
}

/** Registers the cross-field rule that prevents version-only no-op updates. */
function HasEditableField(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyName): void => {
    registerDecorator({
      name: 'hasEditableKnowledgeBaseField',
      ...(options === undefined ? {} : { options }),
      propertyName: propertyName.toString(),
      target: target.constructor,
      validator: { validate: hasEditableField },
    });
  };
}

/** Accepts only editable knowledge-base fields and a positive observed version. */
export class UpdateKnowledgeBaseDto implements UpdateKnowledgeBaseRequest {
  @Transform(trimString)
  @ValidateIf(isSupplied)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Transform(trimString)
  @ValidateIf(isSupplied)
  @IsString()
  @Length(1, 200)
  name?: string;

  @HasEditableField({ message: 'name or description must be supplied' })
  @IsInt()
  @Min(1)
  version!: number;
}
