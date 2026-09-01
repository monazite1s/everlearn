/**
 * @fileoverview 定义 Worker 为计划触发创建简报运行的请求边界。
 */

import { IsUUID } from 'class-validator';

/** Worker 为计划触发创建简报运行的请求边界。 */
export class ScheduledNewsDigestDto {
  @IsUUID()
  subscriptionId!: string;
}
