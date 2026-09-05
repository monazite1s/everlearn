/**
 * @fileoverview 定义单条订阅来源的请求边界形态。
 */

import { IsIn, IsString, Validate } from 'class-validator';

import { IsValidSourceValueConstraint } from './news-source-value.constraint';

/** 单条订阅来源的请求边界形态。 */
export class NewsSourceDto {
  @IsIn(['rss', 'site', 'search'])
  type!: 'rss' | 'search' | 'site';

  @IsString()
  @Validate(IsValidSourceValueConstraint)
  value!: string;
}
