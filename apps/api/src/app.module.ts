/**
 * @fileoverview Declares the infrastructure-only root module for the HTTP API.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { HealthController } from './health.controller';
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
export class AppModule {}
