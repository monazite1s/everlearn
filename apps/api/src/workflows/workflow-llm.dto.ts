/**
 * @fileoverview 定义 LLM 生成节点的请求边界。
 */

import { IsString, Length } from 'class-validator';

/** LLM 生成节点的请求边界。 */
export class LlmActionDto {
  @IsString()
  @Length(1, 8_000)
  prompt!: string;
}
