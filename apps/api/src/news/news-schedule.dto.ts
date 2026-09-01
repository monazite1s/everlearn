/**
 * @fileoverview 定义资讯计划的请求边界形态。
 */

import { IsIn, IsString, Length, Matches } from 'class-validator';

/** 计划边界的闭合形态。 */
export class NewsScheduleDto {
  @IsIn(['daily', 'weekly'])
  kind!: 'daily' | 'weekly';

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/u)
  time!: string;

  @IsString()
  @Length(1, 64)
  timezone!: string;
}
