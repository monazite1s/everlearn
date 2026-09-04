/** @fileoverview 组合 API 基础设施和显式领域模块。 */

import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';

import { ApiExceptionFilter, createApiValidationPipe } from './http-boundary/api-exception.filter';
import { HealthController } from './http-boundary/health.controller';
import { AiModule } from './ai/ai.module';
import { KnowledgeBasesModule } from './knowledge-bases/knowledge-bases.module';
import { NewsModule } from './news/news.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { DocumentsModule } from './documents/documents.module';
import { InboxItemsModule } from './inbox-items/inbox-items.module';
import { RequestCorrelationMiddleware } from './http-boundary/request-correlation.middleware';
import { SearchModule } from './search/search.module';
import { TutorialsModule } from './tutorials/tutorials.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { validateRuntimeEnvironment } from './config/runtime-config';

/** 用于持有领域模块依赖的 API 基础设施。 */
@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateRuntimeEnvironment,
    }),
    AiModule,
    AttachmentsModule,
    DocumentsModule,
    InboxItemsModule,
    KnowledgeBasesModule,
    NewsModule,
    SearchModule,
    TutorialsModule,
    WorkflowsModule,
  ],
  providers: [
    { provide: APP_PIPE, useFactory: createApiValidationPipe },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule implements NestModule {
  /** 用于在所有控制器路由前建立请求关联。 */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestCorrelationMiddleware).forRoutes('*');
  }
}
