/**
 * @fileoverview 校验大纲编辑的 HTTP 输入形态。
 */

import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';

import { OutlineChapterDto } from './outline-chapter.dto';

/** 大纲编辑的 HTTP 输入形态。 */
export class TutorialOutlineDto {
  /** 有序章节列表。 */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OutlineChapterDto)
  chapters!: OutlineChapterDto[];
}
