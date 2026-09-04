/**
 * @fileoverview 校验 Worker 大纲运行终态输入。
 */

import { IsArray, IsObject, IsOptional, IsString, Length } from 'class-validator';

import { OutlineChapterDto } from './outline-chapter.dto';

/** 大纲运行终态输入。 */
export class CompleteTutorialOutlineDto {
  /** 运行终态。 */
  @IsString()
  status!: 'failed' | 'succeeded';

  /** 成功时回写的结构化大纲。 */
  @IsOptional()
  @IsObject()
  outline?: { chapters: OutlineChapterDto[] };

  /** 研究降级等告警。 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  warnings?: string[];

  /** 失败时的稳定错误码。 */
  @IsOptional()
  @IsString()
  @Length(1, 120)
  errorCode?: string;
}
