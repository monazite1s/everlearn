/** @fileoverview 校验文档子树导出的查询参数。 */

import { IsOptional, IsUUID } from 'class-validator';

/** 用于限定导出根文档，缺省时导出整个知识库。 */
export class ExportDocumentsQueryDto {
  @IsOptional()
  @IsUUID()
  rootId?: string;
}
