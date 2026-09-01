/**
 * @fileoverview 定义创建工作流的请求边界。
 */

import { IsString, Length } from 'class-validator';

/** 创建 workflow 的请求边界。 */
export class CreateWorkflowDto {
  @IsString()
  @Length(1, 120)
  name!: string;
}
