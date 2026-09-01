/**
 * @fileoverview 定义创建资讯订阅的请求边界。
 */

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';

import { NewsScheduleDto } from './news-schedule.dto';

/** 创建订阅的请求边界。 */
export class CreateNewsSubscriptionDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsString()
  @Matches(/^https?:\/\/\S{1,2000}$/u)
  feedUrl!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 40, { each: true })
  includeKeywords?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 40, { each: true })
  excludeKeywords?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => NewsScheduleDto)
  schedule?: NewsScheduleDto | null;
}
