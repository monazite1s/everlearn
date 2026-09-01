/**
 * @fileoverview 定义计划触发的请求边界。
 */

import { IsUUID } from 'class-validator';

/** 计划触发的请求边界。 */
export class ScheduledRunDto {
  @IsUUID()
  workflowId!: string;
}
