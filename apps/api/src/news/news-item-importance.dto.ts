/**
 * @fileoverview 定义单条资讯条目判定结果的请求边界。
 */

import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

/** 单条资讯条目的重要性与相关性判定结果。 */
export class NewsItemImportanceDto {
  @IsUUID()
  itemId!: string;

  @IsIn(['high', 'normal', 'low'])
  importance!: 'high' | 'normal' | 'low';

  /** 相关性判定，被拒条目在简报流中不可见。 */
  @IsOptional()
  @IsIn(['accepted', 'rejected'])
  relevance?: 'accepted' | 'rejected';

  /** 三合一判定产出的中文一句话摘要，写入条目处理正文。 */
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  processedContent?: string;
}
