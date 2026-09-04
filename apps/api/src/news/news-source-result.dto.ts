/**
 * @fileoverview 定义 Worker 回写来源决策记录的请求边界。
 */

import { IsIn, IsString, Length } from 'class-validator';

/** Worker 回写单条来源决策的请求边界。 */
export class NewsSourceResultDto {
  @IsString()
  @Length(1, 2048)
  url!: string;

  @IsString()
  @Length(1, 500)
  title!: string;

  @IsIn(['adopted', 'skipped'])
  decision!: 'adopted' | 'skipped';

  @IsString()
  @Length(1, 200)
  reason!: string;
}
