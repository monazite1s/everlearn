/**
 * @fileoverview 定义 Worker 触发资讯搜索来源采集的内部动作请求边界。
 */

import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

/** Worker 请求执行一次 Web 搜索的请求边界。 */
export class NewsWebSearchActionDto {
  @IsString()
  @Length(1, 200)
  query!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxResults?: number;
}
