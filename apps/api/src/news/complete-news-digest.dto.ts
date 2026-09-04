/**
 * @fileoverview 定义 Worker 汇报简报运行终态的请求边界。
 */

import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

import { NewsSeenItemDto } from './news-seen-item.dto';
import { NewsSourceResultDto } from './news-source-result.dto';

/** Worker 汇报简报运行终态的请求边界。 */
export class CompleteNewsDigestDto {
  @IsIn(['failed', 'succeeded'])
  status!: 'failed' | 'succeeded';

  @IsOptional()
  @IsUUID()
  briefDocumentId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  errorCode?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested()
  @Type(() => NewsSeenItemDto)
  seenItems?: NewsSeenItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Length(1, 500, { each: true })
  warnings?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => NewsSourceResultDto)
  sourceResults?: NewsSourceResultDto[];
}
