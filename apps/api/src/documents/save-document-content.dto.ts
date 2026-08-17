/** @fileoverview 校验并规范化文档正文保存的 HTTP 输入。 */

import type { SaveDocumentContentRequest } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Transform } from 'class-transformer';
import { IsDefined, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

/** 用于裁剪字符串且保留其他值供类型校验。 */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** 用于限定正文保存必须提交结构化正文、Schema 版本与正整数观察版本。 */
export class SaveDocumentContentDto implements SaveDocumentContentRequest {
  @IsDefined()
  contentJson!: unknown;

  @IsInt()
  @Min(1)
  schemaVersion!: number;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Length(1, 200)
  title?: string;

  @IsInt()
  @Min(1)
  version!: number;
}
