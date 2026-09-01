/** @fileoverview 将知识库范围内的文档树 HTTP 输入映射到应用服务。 */

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type {
  DocumentDetail,
  DocumentExportResponse,
  DocumentListResponse,
} from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import { UuidParamDto } from '../http-boundary/uuid-param.dto';
import { CreateDocumentDto } from './create-document.dto';
import { DocumentExportService } from './document-export.service';
import { ExportDocumentsQueryDto } from './export-documents-query.dto';
import { DocumentsService } from './documents.service';
import { ListDocumentsQueryDto } from './list-documents-query.dto';

/** 用于路由知识库范围内的文档树请求。 */
@Controller('knowledge-bases/:id/documents')
export class KnowledgeBaseDocumentsController {
  /** 用于注入限定所有者的文档应用与导出服务。 */
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly documentExportService: DocumentExportService,
  ) {}

  /** 用于按父节点分页读取有效知识库的直接子节点。 */
  @Get()
  list(
    @Param() params: UuidParamDto,
    @Query() query: ListDocumentsQueryDto,
  ): Promise<DocumentListResponse> {
    return this.documentsService.list(params.id, query);
  }

  /** 用于按可选根文档导出有效子树的 Markdown 源投影。 */
  @Get('export')
  exportSubtree(
    @Param() params: UuidParamDto,
    @Query() query: ExportDocumentsQueryDto,
  ): Promise<DocumentExportResponse> {
    return this.documentExportService.export(params.id, query.rootId);
  }

  /** 用于在有效知识库内创建根或子文档。 */
  @Post()
  create(@Param() params: UuidParamDto, @Body() input: CreateDocumentDto): Promise<DocumentDetail> {
    return this.documentsService.create(params.id, input);
  }
}
