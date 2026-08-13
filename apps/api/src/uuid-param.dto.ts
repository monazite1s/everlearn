/** @fileoverview Defines the reusable UUID route parameter boundary for business resources. */

import { IsUUID } from 'class-validator';

/** Validates one canonical resource ID supplied through an HTTP route parameter. */
export class UuidParamDto {
  @IsUUID()
  id!: string;
}
