/**
 * @fileoverview 校验大纲单章的 HTTP 输入形态。
 */

import { IsArray, IsOptional, IsString, Length } from 'class-validator';

/** 大纲单章的 HTTP 输入形态。 */
export class OutlineChapterDto {
  /** 章节稳定键。 */
  @IsString()
  @Length(1, 120)
  nodeKey!: string;

  /** 章节标题。 */
  @IsString()
  @Length(1, 200)
  title!: string;

  /** 章节摘要。 */
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  summary?: string;

  /** 前置依赖 nodeKey 列表。 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 120, { each: true })
  dependsOn?: string[];
}
