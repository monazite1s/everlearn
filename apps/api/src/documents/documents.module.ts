/** @fileoverview 组装限定所有者的文档读取、创建与重命名 HTTP 切片。 */

import type { NextFunction, Request, Response } from 'express';

import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { KnowledgeBaseDocumentsController } from './knowledge-base-documents.controller';

/** 用于在控制器校验前拒绝浏览器表单写入。 */
function requireJsonContentType(request: Request, _response: Response, next: NextFunction): void {
  if (!['PATCH', 'POST'].includes(request.method)) return next();
  const mediaType = request.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') throw new UnsupportedMediaTypeException();
  next();
}

/** 用于持有本切片所需的最小控制器、服务、身份和数据库依赖。 */
@Module({
  controllers: [DocumentsController, KnowledgeBaseDocumentsController],
  imports: [DatabaseModule],
  providers: [DocumentsService, LocalIdentityContext],
})
export class DocumentsModule implements NestModule {
  /** 用于向所有文档写入路由应用仅 JSON 规则。 */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(requireJsonContentType)
      .forRoutes(DocumentsController, KnowledgeBaseDocumentsController);
  }
}
