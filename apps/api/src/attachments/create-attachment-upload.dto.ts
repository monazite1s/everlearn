/** @fileoverview 校验并规范化附件上传预检的 HTTP 输入。 */

import type { CreateAttachmentUploadRequest } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Transform } from 'class-transformer';
import { IsDefined, IsInt, IsString, Length, Min } from 'class-validator';

/** 用于裁剪字符串且保留其他值供类型校验。 */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** 用于限定预检必须提交文件名、MIME 与正整数大小。 */
export class CreateAttachmentUploadDto implements CreateAttachmentUploadRequest {
  // 上限与共享契约 ATTACHMENT_FILE_NAME_MAX_LENGTH 保持一致。
  @IsDefined()
  @Transform(trimString)
  @IsString()
  @Length(1, 255)
  fileName!: string;

  @IsDefined()
  @Transform(trimString)
  @IsString()
  @Length(3, 255)
  mimeType!: string;

  @IsDefined()
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
