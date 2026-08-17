/** @fileoverview 校验附件上传确认提交的 SHA-256 输入。 */

import type { ConfirmAttachmentUploadRequest } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { IsDefined, IsString, Matches } from 'class-validator';

/** 用于限定确认必须提交小写十六进制 64 位摘要。 */
export class ConfirmAttachmentUploadDto implements ConfirmAttachmentUploadRequest {
  @IsDefined()
  @IsString()
  @Matches(/^[0-9a-f]{64}$/)
  sha256!: string;
}
