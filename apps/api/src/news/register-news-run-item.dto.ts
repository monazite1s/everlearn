/**
 * @fileoverview 定义 Worker 登记单条资讯条目的请求边界。
 */

import { IsIn, IsISO8601, IsOptional, IsString, Length } from 'class-validator';

/** Worker 登记单条资讯条目的请求边界。 */
export class RegisterNewsRunItemDto {
  @IsString()
  @Length(1, 2048)
  url!: string;

  @IsString()
  @Length(1, 500)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  snippet?: string;

  @IsIn(['rss', 'search'])
  sourceType!: 'rss' | 'search';

  @IsString()
  @Length(64, 64)
  contentFingerprint!: string;

  @IsOptional()
  @IsISO8601()
  publishedAt?: string | null;
}
