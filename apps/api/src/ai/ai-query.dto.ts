/**
 * @fileoverview 校验 AI 问答与草稿生成的请求体。
 */

import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** AI 问答请求体。 */
export class AiQaRequestDto {
  @IsUUID()
  knowledgeBaseId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  question!: string;
}
