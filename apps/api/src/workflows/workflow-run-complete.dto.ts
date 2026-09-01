/**
 * @fileoverview 定义 Worker 汇报运行终态的请求边界。
 */

import { IsIn, IsOptional, IsString, Length } from 'class-validator';

/** Worker 汇报运行终态的请求边界。 */
export class CompleteWorkflowRunDto {
  @IsIn(['failed', 'succeeded'])
  status!: 'failed' | 'succeeded';

  @IsOptional()
  @IsString()
  @Length(1, 2000)
  outputSummary?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  errorCode?: string;
}
