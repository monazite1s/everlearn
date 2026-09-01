/**
 * @fileoverview 定义简报引用的已见条目请求边界。
 */

import { IsString, Length } from 'class-validator';

/** 简报引用的已见条目边界。 */
export class NewsSeenItemDto {
  @IsString()
  @Length(1, 2000)
  normalizedUrl!: string;

  @IsString()
  @Length(64, 64)
  contentHash!: string;
}
