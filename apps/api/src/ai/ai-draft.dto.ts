/**
 * @fileoverview 校验 AI 草稿生成的请求体。
 */

import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** AI 草稿生成请求体。 */
export class AiDraftRequestDto {
  @IsUUID()
  documentId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  instruction!: string;
}
