/** @fileoverview 将单个文档资源的 HTTP 输入映射到应用服务。 */

import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import type { DocumentDetail } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import { UuidParamDto } from '../http-boundary/uuid-param.dto';
import { DocumentsService } from './documents.service';
import { RenameDocumentDto } from './rename-document.dto';

/** 用于路由单个文档资源的读取与重命名请求。 */
@Controller('documents')
export class DocumentsController {
  /** 用于注入限定所有者的文档应用服务。 */
  constructor(private readonly documentsService: DocumentsService) {}

  /** 用于读取有效文档详情且不暴露所有权失败。 */
  @Get(':id')
  read(@Param() params: UuidParamDto): Promise<DocumentDetail> {
    return this.documentsService.read(params.id);
  }

  /** 用于在提交版本有效时更新文档标题。 */
  @Patch(':id')
  rename(@Param() params: UuidParamDto, @Body() input: RenameDocumentDto): Promise<DocumentDetail> {
    return this.documentsService.rename(params.id, input);
  }
}
