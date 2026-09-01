/** @fileoverview 校验文档标签整体设置的 HTTP 输入。 */

import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, Length } from 'class-validator';

/** 每次设置允许的标签数量上限，与服务端规范化裁剪一致。 */
export const DOCUMENT_TAGS_MAX_COUNT = 20;

/** 用于限定文档标签必须为 1..20 个、每项 1..50 字符的字符串数组。 */
export class SetDocumentTagsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(DOCUMENT_TAGS_MAX_COUNT)
  @IsString({ each: true })
  @Length(1, 50, { each: true })
  names!: string[];
}
