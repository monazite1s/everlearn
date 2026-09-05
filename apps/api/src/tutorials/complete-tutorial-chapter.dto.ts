/**
 * @fileoverview 校验 Worker 章节运行终态输入。
 */

import { IsIn, IsOptional, IsString, Length } from 'class-validator';

/** 章节运行终态输入。 */
export class CompleteTutorialChapterDto {
  /** 运行终态。 */
  @IsIn(['completed', 'failed'])
  status!: 'completed' | 'failed';

  /** 成功时回写的章节 Markdown 正文。 */
  @IsOptional()
  @IsString()
  @Length(1, 200_000)
  markdown?: string;

  /** 失败时的稳定错误码。 */
  @IsOptional()
  @IsString()
  @Length(1, 120)
  errorCode?: string;
}
