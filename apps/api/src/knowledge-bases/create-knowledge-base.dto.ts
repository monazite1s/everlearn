/** @fileoverview 校验并规范化知识库创建的 HTTP 输入。 */

import type { CreateKnowledgeBaseRequest } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Transform } from 'class-transformer';
import { IsString, Length, MaxLength, ValidateIf } from 'class-validator';

/** 用于裁剪字符串且保留其他值供类型校验。 */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** 用于对包括 null 在内的已提供可选字段执行校验。 */
function isSupplied(_object: object, value: unknown): boolean {
  return value !== undefined;
}

/** 用于限定普通知识库创建时可编辑的字段。 */
export class CreateKnowledgeBaseDto implements CreateKnowledgeBaseRequest {
  @Transform(trimString)
  @ValidateIf(isSupplied)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @Transform(trimString)
  @IsString()
  @Length(1, 200)
  name!: string;
}
