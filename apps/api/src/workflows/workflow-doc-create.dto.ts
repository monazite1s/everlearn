/**
 * @fileoverview 定义文档创建节点的请求边界。
 */

import { IsUUID, IsString, Length } from 'class-validator';

/** 文档创建节点的请求边界。 */
export class DocCreateActionDto {
  @IsUUID()
  knowledgeBaseId!: string;

  @IsString()
  @Length(1, 200)
  title!: string;

  @IsString()
  @Length(0, 100_000)
  plainText!: string;

  @IsUUID()
  runId!: string;
}
