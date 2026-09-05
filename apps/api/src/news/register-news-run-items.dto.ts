/**
 * @fileoverview 定义 Worker 批量登记资讯条目的请求边界与登记结果形态。
 */

import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';

import { RegisterNewsRunItemDto } from './register-news-run-item.dto';

/** Worker 登记一批资讯条目的请求边界。 */
export class RegisterNewsRunItemsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => RegisterNewsRunItemDto)
  items!: RegisterNewsRunItemDto[];
}

/** 登记结果：按指纹映射条目 id。 */
export interface RegisteredNewsRunItem {
  readonly contentFingerprint: string;
  readonly id: string;
}
