/**
 * @fileoverview 校验 Worker 内部领取批量上限输入。
 */

import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** 领取批量上限输入。 */
export class TutorialDispatchDto {
  /** 单次领取数量上限。 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}
