/** @fileoverview 定义修订子资源路由的文档标识与修订号参数边界。 */

import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

/** 用于校验修订路由参数中的文档标识与正整数修订号。 */
export class RevisionParamDto {
  @IsUUID()
  id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  revisionNumber!: number;
}
