/**
 * @fileoverview 校验对话消息发送的 HTTP 输入形态。
 */

import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

/** 用于裁剪单个字符串输入。 */
function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

/** 对话消息发送的 HTTP 输入形态。 */
export class ConversationMessageDto {
  /** 用户发送给 Agent 的消息内容。 */
  @Transform(trimString)
  @IsString()
  @Length(1, 4000)
  content!: string;
}
