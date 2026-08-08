/**
 * @fileoverview Correlates API requests and emits completion logs from a safe field allowlist.
 */

import { randomUUID } from 'node:crypto';

import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

interface CompletionLogInput {
  durationMs: number;
  method: string;
  path: string;
  requestId: string;
  statusCode: number;
}

export interface HttpCompletionLog extends CompletionLogInput {
  event: 'http.request.completed';
}

/** Keeps a valid UUID supplied by the caller or creates a new UUID v4. */
export function resolveRequestId(candidate: string | undefined): string {
  return candidate !== undefined && isUUID(candidate) ? candidate : randomUUID();
}

/** Produces the only fields permitted in routine HTTP completion logs. */
export function createHttpCompletionLog(input: CompletionLogInput): HttpCompletionLog {
  return {
    durationMs: input.durationMs,
    event: 'http.request.completed',
    method: input.method,
    path: input.path,
    requestId: input.requestId,
    statusCode: input.statusCode,
  };
}

/** Assigns request IDs before routing and logs a safe completion summary. */
@Injectable()
export class RequestCorrelationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestCorrelationMiddleware.name);

  /** Correlates one request without inspecting headers other than the request ID. */
  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = resolveRequestId(request.header(REQUEST_ID_HEADER));
    const startedAt = performance.now();
    response.setHeader(REQUEST_ID_HEADER, requestId);

    /** Logs after Express has finalized the status code and response. */
    const logCompletion = (): void => {
      this.logger.log(
        createHttpCompletionLog({
          durationMs: Math.round(performance.now() - startedAt),
          method: request.method,
          path: request.path,
          requestId,
          statusCode: response.statusCode,
        }),
      );
    };

    response.once('finish', logCompletion);
    next();
  }
}
