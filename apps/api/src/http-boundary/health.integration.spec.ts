/**
 * @fileoverview 通过 Nest HTTP 适配器验证健康契约和请求关联。
 */

import type { Server } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { isUUID } from 'class-validator';
import request from 'supertest';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { REQUEST_ID_HEADER } from './request-correlation.middleware';

const validRequestId = '9c52a51c-5d11-4b8a-99c8-34ea773fa93e';
let application: INestApplication;

interface HealthResponse {
  service: 'api';
  status: 'ok';
  timestamp: string;
  version: string;
}

/** 用于在 AppModule 读取配置前提供隔离测试值。 */
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

/** 用于启动不占用固定端口的内存 HTTP 适配器。 */
async function startApplication(): Promise<void> {
  applyFixtureEnvironment();
  const { AppModule } = await import('../app.module');
  application = await NestFactory.create(AppModule, { logger: false });
  application.setGlobalPrefix('api/v1');
  await application.init();
}

/** 用于在 HTTP 断言完成后释放 Nest 应用。 */
async function stopApplication(): Promise<void> {
  await application.close();
}

/** 用于将 Nest 适配器服务收窄为 Supertest 所需契约。 */
function getHttpServer(): Server {
  return application.getHttpServer() as Server;
}

/** 用于验证存活和就绪探针公开稳定且不可缓存的契约。 */
async function servesHealthContracts(): Promise<void> {
  for (const probe of ['live', 'ready']) {
    const response = await request(getHttpServer()).get(`/api/v1/health/${probe}`);
    const body = JSON.parse(response.text) as HealthResponse;
    expect(response.status).toBe(200);
    expect(response.get('Cache-Control')).toBe('no-store');
    expect(body).toMatchObject({ service: 'api', status: 'ok', version: '0.0.0' });
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  }
}

/** 用于验证有效请求标识被保留且非法标识被替换。 */
async function correlatesRequests(): Promise<void> {
  const retained = await request(getHttpServer())
    .get('/api/v1/health/live')
    .set(REQUEST_ID_HEADER, validRequestId);
  const replaced = await request(getHttpServer())
    .get('/api/v1/health/live')
    .set(REQUEST_ID_HEADER, 'not-a-uuid');
  const generated = await request(getHttpServer()).get('/api/v1/health/live');
  expect(retained.get(REQUEST_ID_HEADER)).toBe(validRequestId);
  expect(isUUID(replaced.get(REQUEST_ID_HEADER))).toBe(true);
  expect(isUUID(generated.get(REQUEST_ID_HEADER))).toBe(true);
}

beforeAll(startApplication);
afterAll(stopApplication);
test('serves stable health contracts', servesHealthContracts);
test('correlates API requests', correlatesRequests);
