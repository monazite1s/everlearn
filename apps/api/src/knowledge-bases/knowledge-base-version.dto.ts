/** @fileoverview 校验带版本的知识库生命周期请求。 */

import type { KnowledgeBaseVersionRequest } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { IsInt, Min } from 'class-validator';

/** 用于接收调用方最后观察到的正整数版本。 */
export class KnowledgeBaseVersionDto implements KnowledgeBaseVersionRequest {
  @IsInt()
  @Min(1)
  version!: number;
}
