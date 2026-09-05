/**
 * @fileoverview 定义资讯计划的请求边界形态。
 */

import { IsIn, IsInt, IsString, Length, Matches, Max, Min, ValidateIf } from 'class-validator';

/** 计划边界的闭合形态，weekly 必须携带 0..6 的星期。 */
export class NewsScheduleDto {
  @IsIn(['daily', 'weekly'])
  kind!: 'daily' | 'weekly';

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/u)
  time!: string;

  @IsString()
  @Length(1, 64)
  timezone!: string;

  @ValidateIf((schedule: NewsScheduleDto) => schedule.kind === 'weekly')
  @IsInt()
  @Min(0)
  @Max(6)
  weekday?: number | null;
}
