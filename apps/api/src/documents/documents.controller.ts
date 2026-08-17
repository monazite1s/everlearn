/** @fileoverview 将单个文档资源的 HTTP 输入映射到应用服务。 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { DocumentContentDetail, DocumentDetail } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import { DocumentContentService } from './document-content.service';
import { DocumentMoveService } from './document-move.service';
import { DocumentTrashService } from './document-trash.service';
import { DocumentsService } from './documents.service';
import { DocumentVersionDto } from './document-version.dto';
import { MoveDocumentDto } from './move-document.dto';
import { RenameDocumentDto } from './rename-document.dto';
import { SaveDocumentContentDto } from './save-document-content.dto';
import { requireIdempotencyKey } from '../http-boundary/idempotency-key';
import { UuidParamDto } from '../http-boundary/uuid-param.dto';

/** 用于路由单个文档资源的读取、重命名、正文保存、移动、删除与恢复请求。 */
@Controller('documents')
export class DocumentsController {
  /** 用于注入限定所有者的文档应用服务。 */
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly documentContentService: DocumentContentService,
    private readonly documentMoveService: DocumentMoveService,
    private readonly documentTrashService: DocumentTrashService,
  ) {}

  /** 用于读取有效文档详情且不暴露所有权失败。 */
  @Get(':id')
  read(@Param() params: UuidParamDto): Promise<DocumentDetail> {
    return this.documentsService.read(params.id);
  }

  /** 用于读取有效文档的详情与正文内容投影。 */
  @Get(':id/content')
  readContent(@Param() params: UuidParamDto): Promise<DocumentContentDetail> {
    return this.documentContentService.read(params.id);
  }

  /** 用于在标题与正文统一版本有效时保存内容。 */
  @Patch(':id/content')
  saveContent(
    @Param() params: UuidParamDto,
    @Body() input: SaveDocumentContentDto,
  ): Promise<DocumentContentDetail> {
    return this.documentContentService.save(params.id, input);
  }

  /** 用于在提交版本有效时更新文档标题。 */
  @Patch(':id')
  rename(@Param() params: UuidParamDto, @Body() input: RenameDocumentDto): Promise<DocumentDetail> {
    return this.documentsService.rename(params.id, input);
  }

  /** 用于在幂等键与版本有效时原子移动文档及其后代。 */
  @Post(':id/move')
  @HttpCode(HttpStatus.OK)
  move(
    @Param() params: UuidParamDto,
    @Body() input: MoveDocumentDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<DocumentDetail> {
    return this.documentMoveService.move(params.id, input, requireIdempotencyKey(idempotencyKey));
  }

  /** 用于在提交版本有效时把文档及其子树移入回收站。 */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() params: UuidParamDto, @Body() input: DocumentVersionDto): Promise<void> {
    return this.documentTrashService.remove(params.id, input);
  }

  /** 用于在幂等键与版本有效时恢复文档完整子树。 */
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  restore(
    @Param() params: UuidParamDto,
    @Body() input: DocumentVersionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<DocumentDetail> {
    return this.documentTrashService.restore(
      params.id,
      input,
      requireIdempotencyKey(idempotencyKey),
    );
  }
}
