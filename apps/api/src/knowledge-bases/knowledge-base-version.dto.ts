/** @fileoverview Validates versioned knowledge-base lifecycle requests. */

import type { KnowledgeBaseVersionRequest } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { IsInt, Min } from 'class-validator';

/** Accepts the positive version last observed by the caller. */
export class KnowledgeBaseVersionDto implements KnowledgeBaseVersionRequest {
  @IsInt()
  @Min(1)
  version!: number;
}
