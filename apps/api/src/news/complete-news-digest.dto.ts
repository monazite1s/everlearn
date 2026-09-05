/**
 * @fileoverview 定义 Worker 汇报简报运行终态与条目处理结果的请求边界。
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

import { NewsItemImportanceDto } from './news-item-importance.dto';
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
  @IsString({ each: true })
  @Length(1, 500, { each: true })
  warnings?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => NewsItemImportanceDto)
  itemImportance?: NewsItemImportanceDto[];

  /** 被相关性判定拒绝的条目，落库后不再出现在条目流。 */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID(undefined, { each: true })
  rejectedItemIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => NewsSourceResultDto)
  sourceResults?: NewsSourceResultDto[];
}
