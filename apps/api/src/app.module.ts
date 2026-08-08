/**
 * @fileoverview Declares the infrastructure-only root module for the HTTP API.
 */

import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { HealthController } from './health.controller';
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
  ],
})
export class AppModule implements NestModule {
  /** Applies request correlation before every controller route. */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestCorrelationMiddleware).forRoutes('*');
  }
}
