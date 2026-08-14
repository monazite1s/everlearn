/** @fileoverview 定义业务资源复用的 UUID 路由参数边界。 */

import { IsUUID } from 'class-validator';

/** 用于校验 HTTP 路由参数中的规范资源标识。 */
export class UuidParamDto {
  @IsUUID()
  id!: string;
}
