/** @fileoverview 校验并规范化文档创建的 HTTP 输入。 */

import type { CreateDocumentRequest } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

/** 用于裁剪字符串且保留其他值供类型校验。 */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** 用于限定文档创建只接受父节点标识和标题。 */
export class CreateDocumentDto implements CreateDocumentRequest {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @Transform(trimString)
  @IsString()
  @Length(1, 200)
  title!: string;
}
