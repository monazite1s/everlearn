/**
 * @fileoverview 定义单条订阅来源的请求边界形态。
 */

import { IsIn, IsString, Matches } from 'class-validator';

/** 单条订阅来源的请求边界形态。 */
export class NewsSourceDto {
  @IsIn(['rss', 'site', 'search'])
  type!: 'rss' | 'search' | 'site';

  @IsString()
  @Matches(/^https?:\/\/\S{1,2000}$/u)
  value!: string;
}
