/** @fileoverview 将单个文档资源的 HTTP 输入映射到应用服务。 */

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import type { DocumentDetail } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import { DocumentMoveService } from './document-move.service';
import { DocumentsService } from './documents.service';
import { MoveDocumentDto } from './move-document.dto';
import { RenameDocumentDto } from './rename-document.dto';
import { requireIdempotencyKey } from '../http-boundary/idempotency-key';
import { UuidParamDto } from '../http-boundary/uuid-param.dto';

/** 用于路由单个文档资源的读取、重命名与移动请求。 */
@Controller('documents')
export class DocumentsController {
  /** 用于注入限定所有者的文档应用服务。 */
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly documentMoveService: DocumentMoveService,
  ) {}

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
}
