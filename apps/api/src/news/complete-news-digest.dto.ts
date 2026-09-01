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
}
