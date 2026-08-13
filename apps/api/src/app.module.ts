/** @fileoverview Composes API infrastructure and explicit domain modules. */

import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';

import { ApiExceptionFilter, createApiValidationPipe } from './api-exception.filter';
import { HealthController } from './health.controller';
import { KnowledgeBasesModule } from './knowledge-bases/knowledge-bases.module';
import { RequestCorrelationMiddleware } from './request-correlation.middleware';
import { validateRuntimeEnvironment } from './runtime-config';

/** Owns API infrastructure that is available before domain modules are introduced. */
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
  /** Applies request correlation before every controller route. */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestCorrelationMiddleware).forRoutes('*');
  }
}
