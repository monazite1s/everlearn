/** @fileoverview 通过 Nest HTTP 适配器验证全局校验和错误边界。 */
/* eslint-disable max-classes-per-file -- 隔离 HTTP 场景需要同时声明控制器和模块。 */

import type { Server } from 'node:http';

import { Controller, Get, Module, Param, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { REQUEST_ID_HEADER } from './request-correlation.middleware';
import { UuidParamDto } from './uuid-param.dto';

const validResourceId = '20000000-0000-4000-8000-000000000001';
let application: INestApplication;

/** 用于提供仅验证生产 API 边界的隔离路由。 */
class ApiBoundaryProbeController {
  /** 用于返回已经全局 DTO 边界校验的 UUID。 */
  acceptId(params: UuidParamDto): UuidParamDto {
    return params;
  }

  /** 用于抛出必须由生产过滤器隐藏的内部错误。 */
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

/** 用于提供不触发外部调用的有效运行配置。 */
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

/** 用于以内存适配器启动生产 Provider 和测试控制器。 */
async function startApplication(): Promise<void> {
  applyFixtureEnvironment();
  const { AppModule } = await import('./app.module');
  /** 用于组合生产 Provider 与隔离边界探针。 */
  class TestApplicationModule {}
  Module({ controllers: [ApiBoundaryProbeController], imports: [AppModule] })(
    TestApplicationModule,
  );
  application = await NestFactory.create(TestApplicationModule, { logger: false });
  application.setGlobalPrefix('api/v1');
  await application.init();
}

/** 用于在 HTTP 断言后释放 API 资源。 */
async function stopApplication(): Promise<void> {
  await application.close();
}

/** 用于返回 Supertest 可接收的适配器服务。 */
function getHttpServer(): Server {
  return application.getHttpServer() as Server;
}

/** 用于解析 JSON 响应且不信任 Supertest 的无类型正文。 */
function parseBody(response: { text: string }): Record<string, unknown> {
  return JSON.parse(response.text) as Record<string, unknown>;
}

/** 用于验证非法 UUID 路由参数进入稳定校验信封。 */
async function rejectsInvalidUuid(): Promise<void> {
  const response = await request(getHttpServer()).get('/api/v1/boundary-probe/resource/invalid');
  const body = parseBody(response);
  expect(response.status).toBe(400);
  expect(body).toMatchObject({ code: 'VALIDATION_FAILED', message: '请求参数校验失败。' });
  expect(body.requestId).toBe(response.get(REQUEST_ID_HEADER));
}

/** 用于验证有效 UUID 可通过 DTO 转换。 */
async function acceptsValidUuid(): Promise<void> {
  const response = await request(getHttpServer()).get(
    `/api/v1/boundary-probe/resource/${validResourceId}`,
  );
  expect(response.status).toBe(200);
  expect(parseBody(response)).toEqual({ id: validResourceId });
}

/** 用于验证未知错误只公开稳定关联信封。 */
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
