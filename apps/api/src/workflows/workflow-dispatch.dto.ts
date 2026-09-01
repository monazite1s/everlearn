/**
 * @fileoverview 定义 Worker 领取待执行运行的请求边界。
 */

import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** 领取待执行运行的请求边界。 */
export class DispatchWorkflowRunsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  limit?: number;
}
