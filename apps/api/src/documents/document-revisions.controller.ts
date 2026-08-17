/** @fileoverview 将文档修订子资源的 HTTP 输入映射到应用服务。 */

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import type {
  DocumentContentDetail,
  DocumentRevisionDetail,
  DocumentRevisionListResponse,
} from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import { CreateDocumentRevisionDto } from './create-document-revision.dto';
import { DocumentRevisionService } from './document-revision.service';
import { DocumentVersionDto } from './document-version.dto';
import { ListRevisionsQueryDto } from './list-revisions-query.dto';
import { RevisionParamDto } from './revision-param.dto';
import { UuidParamDto } from '../http-boundary/uuid-param.dto';

/** 用于路由单个文档不可变修订的创建、列出、预览与恢复请求。 */
@Controller('documents/:id/revisions')
export class DocumentRevisionsController {
  /** 用于注入限定所有者的修订应用服务。 */
  constructor(private readonly documentRevisionService: DocumentRevisionService) {}

  /** 用于按修订号倒序读取有效文档的修订摘要分页。 */
  @Get()
  list(
    @Param() params: UuidParamDto,
    @Query() query: ListRevisionsQueryDto,
  ): Promise<DocumentRevisionListResponse> {
    return this.documentRevisionService.list(params.id, query);
  }

  /** 用于读取单个修订的全文快照作为恢复预览。 */
  @Get(':revisionNumber')
  read(@Param() params: RevisionParamDto): Promise<DocumentRevisionDetail> {
    return this.documentRevisionService.read(params.id, params.revisionNumber);
  }

  /** 用于在显式触发点为当前编辑内容创建不可变修订。 */
  @Post()
  create(
    @Param() params: UuidParamDto,
    @Body() input: CreateDocumentRevisionDto,
  ): Promise<DocumentRevisionDetail> {
    return this.documentRevisionService.create(params.id, input);
  }

  /** 用于在版本有效时以恢复修订形式回写历史快照。 */
  @Post(':revisionNumber/restore')
  @HttpCode(HttpStatus.OK)
  restore(
    @Param() params: RevisionParamDto,
    @Body() input: DocumentVersionDto,
  ): Promise<DocumentContentDetail> {
    return this.documentRevisionService.restore(params.id, params.revisionNumber, input);
  }
}
