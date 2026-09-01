/**
 * @fileoverview 定义 Worker 追加运行事件的请求边界。
 */

import { IsIn, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

/** Worker 追加运行事件的请求边界。 */
export class AppendWorkflowRunEventDto {
  @IsInt()
  @Min(1)
  seq!: number;

  @IsString()
  @Length(1, 64)
  nodeId!: string;

  @IsIn(['running', 'succeeded', 'failed'])
  status!: 'failed' | 'running' | 'succeeded';

  @IsOptional()
  @IsString()
  @Length(1, 500)
  message?: string;
}
