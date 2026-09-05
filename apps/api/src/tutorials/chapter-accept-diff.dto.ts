/**
 * @fileoverview 校验章节差异接受携带的用户确认内容。
 */

import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

/** 用于裁剪单个字符串输入。 */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** 章节差异接受的 HTTP 输入形态。 */
export class ChapterAcceptDiffDto {
  /** 用户确认要覆盖写入的 Markdown 内容。 */
  @Transform(trimString)
  @IsString()
  @Length(1, 100000)
  content!: string;
}
