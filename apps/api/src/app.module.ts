/**
 * @fileoverview Declares the infrastructure-only root module for the HTTP API.
 */

import { Module } from '@nestjs/common';

import { HealthController } from './health.controller';

/** Owns API infrastructure that is available before domain modules are introduced. */
@Module({
  controllers: [HealthController],
})
export class AppModule {}
