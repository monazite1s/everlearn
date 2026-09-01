/**
 * @fileoverview 定义运行详情路由的参数边界。
 */

import { IsUUID } from 'class-validator';

/** 运行详情路由参数边界。 */
export class RunParamDto {
  @IsUUID()
  runId!: string;
}
