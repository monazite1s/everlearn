/** @fileoverview Carries trusted public conflict categories without accepting client messages. */

import { ConflictException } from '@nestjs/common';

export type ApiConflictCode = 'IDEMPOTENCY_CONFLICT' | 'VERSION_CONFLICT';

/** Marks a server-selected conflict code for the global safe error mapper. */
export class ApiConflictException extends ConflictException {
  /** Stores only an allowlisted code; the public filter owns the user-facing message. */
  constructor(readonly conflictCode: ApiConflictCode) {
    super();
  }
}
