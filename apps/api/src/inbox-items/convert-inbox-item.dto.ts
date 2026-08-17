/** @fileoverview 校验 Inbox 记录转换的目标知识库、可选父级与标题输入。 */

import type { ConvertInboxItemRequest } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

/** 用于裁剪字符串且保留其他值供类型校验。 */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** 用于限定 Inbox 转换只接受目标知识库、可选父节点和标题。 */
export class ConvertInboxItemDto implements ConvertInboxItemRequest {
  @IsUUID()
  knowledgeBaseId!: string;

  @IsOptional()
  @IsUUID()
  parentId?: string;

  @Transform(trimString)
  @IsString()
  @Length(1, 200)
  title!: string;
}
