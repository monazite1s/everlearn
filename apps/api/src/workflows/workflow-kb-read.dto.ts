/**
 * @fileoverview 定义知识库读取节点的请求边界。
 */

import { IsUUID } from 'class-validator';

/** 知识库读取节点的请求边界。 */
export class KbReadActionDto {
  @IsUUID()
  documentId!: string;
}
