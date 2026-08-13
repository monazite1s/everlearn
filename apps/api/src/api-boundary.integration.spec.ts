/** @fileoverview Verifies global validation and error boundaries through the Nest HTTP adapter. */
/* eslint-disable max-classes-per-file -- Nest's isolated HTTP fixture requires a controller and module. */

import type { Server } from 'node:http';

import { Controller, Get, Module, Param, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { REQUEST_ID_HEADER } from './request-correlation.middleware';
import { UuidParamDto } from './uuid-param.dto';

const validResourceId = '20000000-0000-4000-8000-000000000001';
let application: INestApplication;

/** Exposes isolated routes that exercise production API boundary providers. */
class ApiBoundaryProbeController {
  /** Returns a UUID only after the global DTO boundary validates it. */
  acceptId(params: UuidParamDto): UuidParamDto {
    return params;
  }

  /** Throws a private diagnostic that the production filter must hide. */
  failInternally(): never {
    throw new Error('private database and stack detail');
  }
}

const probePrototype = ApiBoundaryProbeController.prototype;
const acceptDescriptor = Object.getOwnPropertyDescriptor(probePrototype, 'acceptId');
const failDescriptor = Object.getOwnPropertyDescriptor(probePrototype, 'failInternally');
if (acceptDescriptor === undefined || failDescriptor === undefined) {
  throw new Error('API boundary probe descriptors are unavailable');
}
Param()(probePrototype, 'acceptId', 0);
Reflect.defineMetadata('design:paramtypes', [UuidParamDto], probePrototype, 'acceptId');
Get('resource/:id')(probePrototype, 'acceptId', acceptDescriptor);
Get('internal-failure')(probePrototype, 'failInternally', failDescriptor);
Controller('boundary-probe')(ApiBoundaryProbeController);

/** Supplies valid runtime configuration without real external calls. */
function applyFixtureEnvironment(): void {
  process.env.DATABASE_URL = 'postgresql://everlearn:fixture@127.0.0.1:5432/everlearn';
  process.env.REDIS_URL = 'redis://127.0.0.1:6379';
  process.env.S3_ACCESS_KEY = 'fixture-access-key';
  process.env.S3_BUCKET = 'everlearn';
  process.env.S3_ENDPOINT = 'http://127.0.0.1:8333';
  process.env.S3_FORCE_PATH_STYLE = 'true';
  process.env.S3_REGION = 'local';
  process.env.S3_SECRET_KEY = 'fixture-secret-key';
}

/** Starts production providers with one test-only controller on an in-memory adapter. */
async function startApplication(): Promise<void> {
  applyFixtureEnvironment();
  const { AppModule } = await import('./app.module');
  /** Combines production providers with the isolated boundary probe. */
  class TestApplicationModule {}
  Module({ controllers: [ApiBoundaryProbeController], imports: [AppModule] })(
    TestApplicationModule,
  );
  application = await NestFactory.create(TestApplicationModule, { logger: false });
  application.setGlobalPrefix('api/v1');
  await application.init();
}

/** Releases API-owned resources after the HTTP assertions. */
async function stopApplication(): Promise<void> {
  await application.close();
}

/** Returns the adapter server accepted by Supertest. */
function getHttpServer(): Server {
  return application.getHttpServer() as Server;
}

/** Parses a JSON response without trusting Supertest's untyped body field. */
function parseBody(response: { text: string }): Record<string, unknown> {
  return JSON.parse(response.text) as Record<string, unknown>;
}

/** Confirms malformed UUID route input reaches the stable validation envelope. */
async function rejectsInvalidUuid(): Promise<void> {
  const response = await request(getHttpServer()).get('/api/v1/boundary-probe/resource/invalid');
  const body = parseBody(response);
  expect(response.status).toBe(400);
  expect(body).toMatchObject({ code: 'VALIDATION_FAILED', message: '请求参数校验失败。' });
  expect(body.requestId).toBe(response.get(REQUEST_ID_HEADER));
}

/** Confirms valid UUID route input survives DTO transformation. */
async function acceptsValidUuid(): Promise<void> {
  const response = await request(getHttpServer()).get(
    `/api/v1/boundary-probe/resource/${validResourceId}`,
  );
  expect(response.status).toBe(200);
  expect(parseBody(response)).toEqual({ id: validResourceId });
}

/** Confirms unexpected errors expose only the stable correlated envelope. */
async function hidesInternalFailure(): Promise<void> {
  const response = await request(getHttpServer()).get('/api/v1/boundary-probe/internal-failure');
  const body = parseBody(response);
  expect(response.status).toBe(500);
  expect(body).toMatchObject({ code: 'INTERNAL_ERROR', message: '服务暂时无法完成请求。' });
  expect(body.requestId).toBe(response.get(REQUEST_ID_HEADER));
  expect(response.text).not.toContain('private database');
}

beforeAll(startApplication, 30_000);
afterAll(stopApplication);
test('rejects invalid UUID route input', rejectsInvalidUuid);
test('accepts valid UUID route input', acceptsValidUuid);
test('hides internal failure details', hidesInternalFailure);
