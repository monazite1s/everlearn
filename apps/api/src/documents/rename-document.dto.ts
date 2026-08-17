/** @fileoverview 校验并规范化文档重命名的 HTTP 输入。 */

import type { RenameDocumentRequest } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Transform } from 'class-transformer';
import { IsInt, IsString, Length, Min } from 'class-validator';

/** 用于裁剪字符串且保留其他值供类型校验。 */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** 用于限定重命名必须同时提交标题和正整数观察版本。 */
export class RenameDocumentDto implements RenameDocumentRequest {
  @Transform(trimString)
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsInt()
  @Min(1)
  version!: number;
}
