/**
 * @fileoverview 定义列出简报运行的查询边界。
 */

import { IsOptional, IsUUID } from 'class-validator';

/** 列出简报运行的查询边界。 */
export class ListNewsDigestRunsDto {
  @IsOptional()
  @IsUUID()
  subscriptionId?: string;
}
