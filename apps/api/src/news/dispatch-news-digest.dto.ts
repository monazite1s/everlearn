/**
 * @fileoverview 定义 Worker 领取简报运行的请求边界。
 */

import { IsInt, IsOptional, Min } from 'class-validator';

/** Worker 领取简报运行的请求边界。 */
export class DispatchNewsDigestDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
