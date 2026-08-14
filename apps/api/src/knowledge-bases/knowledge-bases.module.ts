/** @fileoverview 组装首个限定所有者的知识库 HTTP 切片。 */

import type { NextFunction, Request, Response } from 'express';

import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { LocalIdentityContext } from '../local-identity.context';
import { KnowledgeBaseLifecycleService } from './knowledge-base-lifecycle.service';
import { KnowledgeBasesController } from './knowledge-bases.controller';
import { KnowledgeBasesService } from './knowledge-bases.service';

/** 用于在控制器校验前拒绝浏览器表单写入。 */
function requireJsonContentType(request: Request, _response: Response, next: NextFunction): void {
  if (!['DELETE', 'PATCH', 'POST'].includes(request.method)) return next();
  const mediaType = request.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') throw new UnsupportedMediaTypeException();
  next();
}

/** 用于持有本切片所需的最小控制器、服务、身份和数据库依赖。 */
@Module({
  controllers: [KnowledgeBasesController],
  imports: [DatabaseModule],
  providers: [KnowledgeBaseLifecycleService, KnowledgeBasesService, LocalIdentityContext],
})
export class KnowledgeBasesModule implements NestModule {
  /** 用于向所有知识库写入路由应用仅 JSON 规则。 */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requireJsonContentType).forRoutes(KnowledgeBasesController);
  }
}
