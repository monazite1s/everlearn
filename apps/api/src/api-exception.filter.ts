/** @fileoverview Maps Nest and unknown failures to the stable public API error envelope. */

import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import type { Request, Response } from 'express';

import { ApiConflictException, type ApiConflictCode } from './api-conflict.exception';
import { REQUEST_ID_HEADER, resolveRequestId } from './request-correlation.middleware';

interface ValidationFieldIssue {
  field: string;
  rules: readonly string[];
}

interface ValidationProblem {
  kind: 'validation';
  fields: readonly ValidationFieldIssue[];
}

interface PublicProblem {
  code: string;
  details?: { fields: readonly ValidationFieldIssue[] };
  message: string;
  status: number;
}

interface HttpStatusError extends Error {
  status: number;
  type: string;
}

const PUBLIC_PROBLEMS: Readonly<Record<number, Omit<PublicProblem, 'status'>>> = {
  [HttpStatus.BAD_REQUEST]: { code: 'BAD_REQUEST', message: '请求格式或参数无效。' },
  [HttpStatus.UNAUTHORIZED]: { code: 'AUTHENTICATION_REQUIRED', message: '需要有效身份。' },
  [HttpStatus.FORBIDDEN]: { code: 'FORBIDDEN', message: '没有执行此操作的权限。' },
  [HttpStatus.NOT_FOUND]: { code: 'NOT_FOUND', message: '请求的资源不存在或不可访问。' },
  [HttpStatus.CONFLICT]: { code: 'CONFLICT', message: '资源当前状态不允许此操作。' },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    code: 'UNPROCESSABLE_ENTITY',
    message: '请求无法按当前内容处理。',
  },
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: {
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: '请求正文必须使用 application/json。',
  },
  [HttpStatus.TOO_MANY_REQUESTS]: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后重试。' },
  [HttpStatus.SERVICE_UNAVAILABLE]: {
    code: 'SERVICE_UNAVAILABLE',
    message: '服务暂时不可用，请稍后重试。',
  },
};

const PUBLIC_CONFLICTS: Readonly<Record<ApiConflictCode, Omit<PublicProblem, 'status'>>> = {
  IDEMPOTENCY_CONFLICT: {
    code: 'IDEMPOTENCY_CONFLICT',
    message: '幂等键已用于另一个请求。',
  },
  VERSION_CONFLICT: {
    code: 'VERSION_CONFLICT',
    message: '资源已被其他操作更新，请刷新后重试。',
  },
};

/** Converts nested class-validator failures into safe field and rule identifiers. */
function collectValidationIssues(
  errors: readonly ValidationError[],
  parent = '',
): ValidationFieldIssue[] {
  return errors.flatMap((error) => {
    const field = parent === '' ? error.property : `${parent}.${error.property}`;
    const ownIssue =
      error.constraints === undefined
        ? []
        : [{ field, rules: Object.keys(error.constraints).sort() }];
    return [...ownIssue, ...collectValidationIssues(error.children ?? [], field)];
  });
}

/** Creates the only validation exception shape trusted by the public error filter. */
function createValidationException(errors: ValidationError[]): BadRequestException {
  const problem: ValidationProblem = {
    fields: collectValidationIssues(errors),
    kind: 'validation',
  };
  return new BadRequestException(problem);
}

/** Creates the global DTO boundary with strict allowlisting and explicit conversion. */
export function createApiValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    exceptionFactory: createValidationException,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    whitelist: true,
  });
}

/** Recognizes only the internal validation marker and never trusts arbitrary exception payloads. */
function readValidationProblem(error: HttpException): ValidationProblem | undefined {
  const response = error.getResponse();
  if (typeof response !== 'object' || response === null) return;
  const candidate = response as Partial<ValidationProblem>;
  if (candidate.kind !== 'validation' || !Array.isArray(candidate.fields)) return;
  return { fields: candidate.fields, kind: 'validation' };
}

/** Recognizes only Express JSON syntax errors without trusting arbitrary status-like objects. */
function isJsonSyntaxError(error: unknown): error is HttpStatusError {
  if (!(error instanceof SyntaxError)) return false;
  const candidate = error as Partial<HttpStatusError>;
  return candidate.status === HttpStatus.BAD_REQUEST && candidate.type === 'entity.parse.failed';
}

/** Maps one exception to a fixed status, code, and user-safe Chinese message. */
function resolvePublicProblem(error: unknown): PublicProblem {
  if (isJsonSyntaxError(error)) {
    return { code: 'BAD_REQUEST', message: '请求格式或参数无效。', status: HttpStatus.BAD_REQUEST };
  }
  if (!(error instanceof HttpException)) {
    return { code: 'INTERNAL_ERROR', message: '服务暂时无法完成请求。', status: 500 };
  }
  if (error instanceof ApiConflictException) {
    return { ...PUBLIC_CONFLICTS[error.conflictCode], status: HttpStatus.CONFLICT };
  }
  const validation = readValidationProblem(error);
  if (validation !== undefined) {
    return {
      code: 'VALIDATION_FAILED',
      details: { fields: validation.fields },
      message: '请求参数校验失败。',
      status: HttpStatus.BAD_REQUEST,
    };
  }
  const status = error.getStatus();
  const configured = PUBLIC_PROBLEMS[status];
  return configured === undefined
    ? { code: 'HTTP_ERROR', message: '请求无法完成。', status }
    : { ...configured, status };
}

/** Returns the middleware-issued request ID and repairs it defensively when unavailable. */
function getRequestId(response: Response): string {
  const header = response.getHeader(REQUEST_ID_HEADER);
  const requestId = resolveRequestId(typeof header === 'string' ? header : undefined);
  response.setHeader(REQUEST_ID_HEADER, requestId);
  return requestId;
}

/** Hides internal failures while preserving request correlation for server diagnostics. */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  /** Sends one stable error envelope and logs only safe request metadata for server failures. */
  catch(error: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const problem = resolvePublicProblem(error);
    const requestId = getRequestId(response);
    if (problem.status >= 500) {
      const errorType = error instanceof Error ? error.name : 'UnknownError';
      this.logger.error({
        errorType,
        event: 'http.request.failed',
        method: request.method,
        path: request.path,
        requestId,
      });
    }
    const body = {
      code: problem.code,
      ...(problem.details === undefined ? {} : { details: problem.details }),
      message: problem.message,
      requestId,
    };
    response.status(problem.status).json(body);
  }
}
