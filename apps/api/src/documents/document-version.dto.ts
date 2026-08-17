/** @fileoverview 校验带版本的文档删除与恢复请求。 */

import type { DeleteDocumentRequest, RestoreDocumentRequest } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { IsInt, Min } from 'class-validator';

/** 用于接收调用方最后观察到的正整数版本。 */
export class DocumentVersionDto implements DeleteDocumentRequest, RestoreDocumentRequest {
  @IsInt()
  @Min(1)
  version!: number;
}
