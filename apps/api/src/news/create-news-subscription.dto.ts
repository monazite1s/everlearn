/**
 * @fileoverview 定义创建资讯订阅的请求边界。
 */

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';

import { NewsScheduleDto } from './news-schedule.dto';
import { NewsSourceDto } from './news-source.dto';

/** 创建订阅的请求边界。 */
export class CreateNewsSubscriptionDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsString()
  @Length(1, 200)
  topic!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => NewsSourceDto)
  sources!: NewsSourceDto[];

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
