/** @fileoverview 将 Nest 和未知错误映射为稳定公开 API 错误信封。 */

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
import { ApiDomainException } from './api-domain.exception';
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
  KNOWLEDGE_BASE_DELETED: {
    code: 'KNOWLEDGE_BASE_DELETED',
    message: '原知识库仍在回收站，请先恢复知识库。',
  },
  VERSION_CONFLICT: {
    code: 'VERSION_CONFLICT',
    message: '资源已被其他操作更新，请刷新后重试。',
  },
};

/** 用于将嵌套校验错误转换为安全字段和规则标识。 */
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

/** 用于创建公开错误过滤器唯一信任的校验异常结构。 */
function createValidationException(errors: ValidationError[]): BadRequestException {
  const problem: ValidationProblem = {
    fields: collectValidationIssues(errors),
    kind: 'validation',
  };
  return new BadRequestException(problem);
}

/** 用于建立严格白名单和显式转换的全局 DTO 边界。 */
export function createApiValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    exceptionFactory: createValidationException,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    whitelist: true,
  });
}

/** 用于只识别内部校验标记，不信任任意异常载荷。 */
function readValidationProblem(error: HttpException): ValidationProblem | undefined {
  const response = error.getResponse();
  if (typeof response !== 'object' || response === null) return;
  const candidate = response as Partial<ValidationProblem>;
  if (candidate.kind !== 'validation' || !Array.isArray(candidate.fields)) return;
  return { fields: candidate.fields, kind: 'validation' };
}

/** 用于只识别 Express JSON 语法错误。 */
function isJsonSyntaxError(error: unknown): error is HttpStatusError {
  if (!(error instanceof SyntaxError)) return false;
  const candidate = error as Partial<HttpStatusError>;
  return candidate.status === HttpStatus.BAD_REQUEST && candidate.type === 'entity.parse.failed';
}

/** 用于将异常映射为固定状态、错误码和安全中文消息。 */
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
  if (error instanceof ApiDomainException) {
    return {
      code: error.problem.code,
      message: error.problem.message,
      status: error.problem.status,
    };
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

/** 用于返回中间件请求标识，缺失时生成替代值。 */
function getRequestId(response: Response): string {
  const header = response.getHeader(REQUEST_ID_HEADER);
  const requestId = resolveRequestId(typeof header === 'string' ? header : undefined);
  response.setHeader(REQUEST_ID_HEADER, requestId);
  return requestId;
}

/** 用于隐藏内部错误并保留服务端诊断所需的请求关联。 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  /** 用于发送稳定错误信封并只记录安全请求元数据。 */
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
