/** @fileoverview Wires the first owner-scoped knowledge-base HTTP slice. */

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

/** Rejects browser form writes before controller validation reaches the fixed local identity. */
function requireJsonContentType(request: Request, _response: Response, next: NextFunction): void {
  if (!['DELETE', 'PATCH', 'POST'].includes(request.method)) return next();
  const mediaType = request.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (mediaType !== 'application/json') throw new UnsupportedMediaTypeException();
  next();
}

/** Owns the minimal controller, service, identity, and database dependencies for this slice. */
@Module({
  controllers: [KnowledgeBasesController],
  imports: [DatabaseModule],
  providers: [KnowledgeBaseLifecycleService, KnowledgeBasesService, LocalIdentityContext],
})
export class KnowledgeBasesModule implements NestModule {
  /** Applies the JSON-only rule to every knowledge-base write route. */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requireJsonContentType).forRoutes(KnowledgeBasesController);
  }
}
