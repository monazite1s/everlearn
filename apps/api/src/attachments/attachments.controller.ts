/** @fileoverview 将附件上传、确认与授权下载的 HTTP 输入映射到应用服务。 */

import type { Response } from 'express';

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import type { AttachmentDetail, CreateAttachmentUploadResponse } from '@everlearn/contracts' with {
  'resolution-mode': 'import',
};

import { UuidParamDto } from '../http-boundary/uuid-param.dto';
import { AttachmentsService } from './attachments.service';
import { ConfirmAttachmentUploadDto } from './confirm-attachment-upload.dto';
import { CreateAttachmentUploadDto } from './create-attachment-upload.dto';

/** 用于构造防头注入且保留原始名的 Content-Disposition 值。 */
function buildContentDisposition(kind: string, fileName: string): string {
  const type = kind === 'image' ? 'inline' : 'attachment';
  const asciiName = fileName.replace(/[^\x20-\x7e]/gu, '_').replace(/["\\]/gu, '_') || 'download';
  return `${type}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** 用于路由附件两段式上传与授权下载请求。 */
@Controller('attachments')
export class AttachmentsController {
  /** 用于注入限定所有者的附件应用服务。 */
  constructor(private readonly attachmentsService: AttachmentsService) {}

  /** 用于预检声明并签发临时直传指令。 */
  @Post('uploads')
  createUpload(@Body() input: CreateAttachmentUploadDto): Promise<CreateAttachmentUploadResponse> {
    return this.attachmentsService.createUpload(input);
  }

  /** 用于提交直传对象摘要并完成复核落库。 */
  @Post('uploads/:id/confirm')
  @HttpCode(HttpStatus.OK)
  confirmUpload(
    @Param() params: UuidParamDto,
    @Body() input: ConfirmAttachmentUploadDto,
  ): Promise<AttachmentDetail> {
    return this.attachmentsService.confirmUpload(params.id, input);
  }

  /** 用于在所有权校验后流式输出对象内容。 */
  @Get(':id/content')
  async download(@Param() params: UuidParamDto, @Res() response: Response): Promise<void> {
    const download = await this.attachmentsService.openContent(params.id);
    response
      .status(HttpStatus.OK)
      .setHeader('Content-Type', download.mimeType)
      .setHeader('Content-Length', String(download.detail.sizeBytes))
      .setHeader(
        'Content-Disposition',
        buildContentDisposition(download.detail.kind, download.detail.fileName),
      )
      .setHeader('X-Content-Type-Options', 'nosniff');
    response.on('close', () => download.body.destroy());
    download.body.pipe(response);
  }
}
