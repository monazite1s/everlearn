/** @fileoverview 组装限定所有者的 Inbox 记录读写 HTTP 切片。 */

import type { NextFunction, Request, Response } from 'express';

import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { DocumentsModule } from '../documents/documents.module';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { InboxItemConversionService } from './inbox-item-conversion.service';
import { InboxItemsController } from './inbox-items.controller';
import { InboxItemsService } from './inbox-items.service';

/** 用于在控制器校验前拒绝浏览器表单创建。 */
function requireJsonContentType(request: Request, _response: Response, next: NextFunction): void {
  if (request.method !== 'POST') return next();
  const mediaType = request.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') throw new UnsupportedMediaTypeException();
  next();
}

/** 用于持有本切片所需的最小控制器、服务、身份和数据库依赖。 */
@Module({
  controllers: [InboxItemsController],
  imports: [DatabaseModule, DocumentsModule],
  providers: [InboxItemConversionService, InboxItemsService, LocalIdentityContext],
})
export class InboxItemsModule implements NestModule {
  /** 用于向 Inbox 创建路由应用仅 JSON 规则。 */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requireJsonContentType).forRoutes(InboxItemsController);
  }
}
