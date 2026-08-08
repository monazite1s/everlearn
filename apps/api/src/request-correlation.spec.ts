/**
 * @fileoverview Verifies API request ID propagation and safe completion log shape.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { NestFactory } from '@nestjs/core';
import { isUUID } from 'class-validator';

import { REQUEST_ID_HEADER, createHttpCompletionLog } from './request-correlation.middleware';

const validRequestId = '9c52a51c-5d11-4b8a-99c8-34ea773fa93e';

/** Supplies isolated fixture values before the AppModule evaluates its configuration. */
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

/** Requests the health endpoint with an optional caller-supplied request ID. */
async function fetchHealth(baseUrl: string, requestId?: string): Promise<Response> {
  const url = `${baseUrl}/api/v1/health/live`;
  if (requestId === undefined) {
    return fetch(url);
  }
  return fetch(url, { headers: { [REQUEST_ID_HEADER]: requestId } });
}

/** Confirms valid IDs are retained while missing or invalid values are replaced. */
async function verifiesRequestIdPropagation(): Promise<void> {
  applyFixtureEnvironment();
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');
  await app.listen(0, '127.0.0.1');

  try {
    const baseUrl = await app.getUrl();
    const retained = await fetchHealth(baseUrl, validRequestId);
    const replaced = await fetchHealth(baseUrl, 'not-a-uuid');
    const generated = await fetchHealth(baseUrl);
    assert.equal(retained.headers.get(REQUEST_ID_HEADER), validRequestId);
    assert.ok(isUUID(replaced.headers.get(REQUEST_ID_HEADER) ?? ''));
    assert.ok(isUUID(generated.headers.get(REQUEST_ID_HEADER) ?? ''));
  } finally {
    await app.close();
  }
}

/** Confirms routine logs cannot acquire request body, cookies, prompts, or secret fields. */
function verifiesSafeLogShape(): void {
  const logEntry = createHttpCompletionLog({
    durationMs: 12,
    method: 'POST',
    path: '/api/v1/documents',
    requestId: validRequestId,
    statusCode: 201,
  });
  assert.deepEqual(Object.keys(logEntry).sort(), [
    'durationMs',
    'event',
    'method',
    'path',
    'requestId',
    'statusCode',
  ]);
}

void test('propagates or generates API request IDs', verifiesRequestIdPropagation);
void test('limits API completion logs to safe fields', verifiesSafeLogShape);
