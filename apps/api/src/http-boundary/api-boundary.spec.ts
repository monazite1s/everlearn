/** @fileoverview 验证严格 DTO 校验、固定身份和安全关联错误。 */

import type { ArgumentsHost, ArgumentMetadata } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IsString, IsUUID, Length } from 'class-validator';
import type { Request, Response } from 'express';
import { expect, test } from 'vitest';

import { ApiExceptionFilter, createApiValidationPipe } from './api-exception.filter';
import { LOCAL_USER_ID, LocalIdentityContext } from '../identity/local-identity.context';
import { REQUEST_ID_HEADER } from './request-correlation.middleware';

const requestId = '9c52a51c-5d11-4b8a-99c8-34ea773fa93e';
const validResourceId = '20000000-0000-4000-8000-000000000001';

/** 用于表示不接受所有权输入的普通业务 DTO。 */
class BoundaryInput {
  resourceId!: string;

  title!: string;
}

IsUUID()(BoundaryInput.prototype, 'resourceId');
IsString()(BoundaryInput.prototype, 'title');
Length(1, 20)(BoundaryInput.prototype, 'title');

interface CapturedResponse {
  body?: unknown;
  headers: Record<string, string>;
  status?: number;
}

/** 用于创建 Nest 校验请求 DTO 所需的元数据。 */
function bodyMetadata(): ArgumentMetadata {
  return { data: undefined, metatype: BoundaryInput, type: 'body' };
}

/** 用于构造不依赖 Express 内部实现的 HTTP 响应宿主。 */
function createHttpHost(captured: CapturedResponse): ArgumentsHost {
  const request = { method: 'GET', path: '/api/v1/probe' } as Request;
  /** 用于读取已捕获的响应头。 */
  function getHeader(name: string): string | undefined {
    return captured.headers[name];
  }
  /** 用于捕获序列化响应正文。 */
  function json(body: unknown): Response {
    captured.body = body;
    return response as Response;
  }
  /** 用于捕获响应头。 */
  function setHeader(name: string, value: string): Response {
    captured.headers[name] = value;
    return response as Response;
  }
  /** 用于捕获选定的 HTTP 状态码。 */
  function status(statusCode: number): Response {
    captured.status = statusCode;
    return response as Response;
  }
  const response = {
    getHeader,
    json,
    setHeader,
    status,
  };
  /** 用于返回过滤器所需的请求对象。 */
  function getRequest(): Request {
    return request;
  }
  /** 用于返回过滤器所需的响应对象。 */
  function getResponse(): typeof response {
    return response;
  }
  /** 用于返回 Nest 所需的 HTTP 参数适配器。 */
  function switchToHttp() {
    return { getRequest, getResponse };
  }
  return {
    switchToHttp,
  } as ArgumentsHost;
}

/** 用于执行公开过滤器并返回已捕获错误响应。 */
function filterError(error: unknown): CapturedResponse {
  const captured: CapturedResponse = { headers: { [REQUEST_ID_HEADER]: requestId } };
  new ApiExceptionFilter().catch(error, createHttpHost(captured));
  return captured;
}

/** 用于验证有效 DTO 被转换且调用方所有权输入被拒绝。 */
async function validatesAllowlistedInput(): Promise<void> {
  const pipe = createApiValidationPipe();
  const valid: unknown = await pipe.transform(
    { resourceId: validResourceId, title: '有效输入' },
    bodyMetadata(),
  );
  expect(valid).toBeInstanceOf(BoundaryInput);
  await expect(
    pipe.transform({ ownerId: LOCAL_USER_ID, resourceId: 'invalid', title: '' }, bodyMetadata()),
  ).rejects.toMatchObject({ status: 400 });
}

/** 用于验证校验详情只公开字段名和规则标识。 */
async function exposesSafeValidationDetails(): Promise<void> {
  const pipe = createApiValidationPipe();
  let validationError: unknown;
  try {
    await pipe.transform(
      { ownerId: LOCAL_USER_ID, resourceId: 'invalid', title: '' },
      bodyMetadata(),
    );
  } catch (error: unknown) {
    validationError = error;
  }
  expect(validationError).toBeInstanceOf(BadRequestException);
  const captured = filterError(validationError);
  expect(captured.status).toBe(400);
  const validationBody = captured.body as Record<string, unknown>;
  expect(validationBody.code).toBe('VALIDATION_FAILED');
  expect(validationBody.message).toBe('请求参数校验失败。');
  expect(validationBody.requestId).toBe(requestId);
  const details = validationBody.details as { fields: unknown[] };
  expect(details.fields).toEqual(
    expect.arrayContaining([
      { field: 'ownerId', rules: ['whitelistValidation'] },
      { field: 'resourceId', rules: ['isUuid'] },
      { field: 'title', rules: ['isLength'] },
    ]) as unknown[],
  );
}

/** 用于验证初始身份不受请求数据或外部修改影响。 */
function providesImmutableServerIdentity(): void {
  const identity = new LocalIdentityContext();
  const actor = identity.getActor();
  expect(actor).toEqual({ ownerId: LOCAL_USER_ID });
  expect(Object.isFrozen(actor)).toBe(true);
  expect(identity.getActor()).toBe(actor);
}

/** 用于验证资源不可访问和内部错误均使用安全关联信封。 */
function hidesPrivateFailureDetails(): void {
  const missing = filterError(new NotFoundException('private owner lookup result'));
  const internal = filterError(new Error('private database and stack detail'));
  expect(missing.body).toEqual({
    code: 'NOT_FOUND',
    message: '请求的资源不存在或不可访问。',
    requestId,
  });
  expect(internal.status).toBe(500);
  expect(internal.body).toEqual({
    code: 'INTERNAL_ERROR',
    message: '服务暂时无法完成请求。',
    requestId,
  });
  expect(JSON.stringify(internal.body)).not.toContain('private database');
}

test('validates allowlisted DTO input', validatesAllowlistedInput);
test('returns safe validation details', exposesSafeValidationDetails);
test('provides an immutable server identity', providesImmutableServerIdentity);
test('hides private failure details', hidesPrivateFailureDetails);
