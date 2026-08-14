/**
 * @fileoverview 验证 API 请求标识传播和安全完成日志结构。
 */

import { expect, test } from 'vitest';
import { isUUID } from 'class-validator';

import { createHttpCompletionLog, resolveRequestId } from './request-correlation.middleware';

const validRequestId = '9c52a51c-5d11-4b8a-99c8-34ea773fa93e';

/** 用于验证有效标识被保留且缺失或非法标识被替换。 */
function verifiesRequestIdResolution(): void {
  expect(resolveRequestId(validRequestId)).toBe(validRequestId);
  expect(isUUID(resolveRequestId('not-a-uuid'))).toBe(true);
  expect(isUUID(resolveRequestId(undefined))).toBe(true);
}

/** 用于验证常规日志不会包含正文、Cookie、Prompt 或密钥。 */
function verifiesSafeLogShape(): void {
  const logEntry = createHttpCompletionLog({
    durationMs: 12,
    method: 'POST',
    path: '/api/v1/documents',
    requestId: validRequestId,
    statusCode: 201,
  });
  expect(Object.keys(logEntry).sort()).toEqual([
    'durationMs',
    'event',
    'method',
    'path',
    'requestId',
    'statusCode',
  ]);
}

test('resolves API request IDs', verifiesRequestIdResolution);
test('limits API completion logs to safe fields', verifiesSafeLogShape);
