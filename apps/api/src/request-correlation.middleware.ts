/**
 * @fileoverview 关联 API 请求并按安全字段白名单记录完成日志。
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

/** 用于保留有效请求标识，否则生成 UUID v4。 */
export function resolveRequestId(candidate: string | undefined): string {
  return candidate !== undefined && isUUID(candidate) ? candidate : randomUUID();
}

/** 用于生成 HTTP 完成日志允许记录的字段。 */
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

/** 用于在路由前分配请求标识并记录安全摘要。 */
@Injectable()
export class RequestCorrelationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestCorrelationMiddleware.name);

  /** 用于关联单次请求且不读取其他请求头。 */
  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = resolveRequestId(request.header(REQUEST_ID_HEADER));
    const startedAt = performance.now();
    response.setHeader(REQUEST_ID_HEADER, requestId);

    /** 用于在 Express 确定响应后记录最终状态。 */
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
