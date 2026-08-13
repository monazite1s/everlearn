/** @fileoverview Verifies strict DTO validation, fixed identity, and safe correlated API errors. */

import type { ArgumentsHost, ArgumentMetadata } from '@nestjs/common';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IsString, IsUUID, Length } from 'class-validator';
import type { Request, Response } from 'express';
import { expect, test } from 'vitest';

import { ApiExceptionFilter, createApiValidationPipe } from './api-exception.filter';
import { LOCAL_USER_ID, LocalIdentityContext } from './local-identity.context';
import { REQUEST_ID_HEADER } from './request-correlation.middleware';

const requestId = '9c52a51c-5d11-4b8a-99c8-34ea773fa93e';
const validResourceId = '20000000-0000-4000-8000-000000000001';

/** Represents one ordinary business DTO without accepting ownership input. */
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

/** Creates the metadata used when Nest validates one request body DTO. */
function bodyMetadata(): ArgumentMetadata {
  return { data: undefined, metatype: BoundaryInput, type: 'body' };
}

/** Builds an HTTP host that captures status, headers, and JSON without Express internals. */
function createHttpHost(captured: CapturedResponse): ArgumentsHost {
  const request = { method: 'GET', path: '/api/v1/probe' } as Request;
  /** Reads one captured response header. */
  function getHeader(name: string): string | undefined {
    return captured.headers[name];
  }
  /** Captures one serialized response body. */
  function json(body: unknown): Response {
    captured.body = body;
    return response as Response;
  }
  /** Captures one response header. */
  function setHeader(name: string, value: string): Response {
    captured.headers[name] = value;
    return response as Response;
  }
  /** Captures the selected HTTP status. */
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
  /** Returns the request object expected by the filter. */
  function getRequest(): Request {
    return request;
  }
  /** Returns the response object expected by the filter. */
  function getResponse(): typeof response {
    return response;
  }
  /** Returns the HTTP argument adapter expected by Nest. */
  function switchToHttp() {
    return { getRequest, getResponse };
  }
  return {
    switchToHttp,
  } as ArgumentsHost;
}

/** Executes the public filter and returns the captured error response. */
function filterError(error: unknown): CapturedResponse {
  const captured: CapturedResponse = { headers: { [REQUEST_ID_HEADER]: requestId } };
  new ApiExceptionFilter().catch(error, createHttpHost(captured));
  return captured;
}

/** Confirms valid DTOs are transformed and caller-supplied ownership is rejected. */
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

/** Confirms validation details expose only field names and rule identifiers. */
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

/** Confirms the initial identity cannot be influenced by request data or mutation. */
function providesImmutableServerIdentity(): void {
  const identity = new LocalIdentityContext();
  const actor = identity.getActor();
  expect(actor).toEqual({ ownerId: LOCAL_USER_ID });
  expect(Object.isFrozen(actor)).toBe(true);
  expect(identity.getActor()).toBe(actor);
}

/** Confirms public misses and internal errors share safe correlated envelopes. */
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
