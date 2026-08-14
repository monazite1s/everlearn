/** @fileoverview 组合 API 基础设施和显式领域模块。 */

import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';

import { ApiExceptionFilter, createApiValidationPipe } from './api-exception.filter';
import { HealthController } from './health.controller';
import { KnowledgeBasesModule } from './knowledge-bases/knowledge-bases.module';
import { RequestCorrelationMiddleware } from './request-correlation.middleware';
import { validateRuntimeEnvironment } from './runtime-config';

/** 用于持有领域模块依赖的 API 基础设施。 */
@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      validate: validateRuntimeEnvironment,
    }),
    KnowledgeBasesModule,
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
