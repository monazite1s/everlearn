/**
 * @fileoverview Verifies API request ID propagation and safe completion log shape.
 */

import { expect, test } from 'vitest';
import { isUUID } from 'class-validator';

import { createHttpCompletionLog, resolveRequestId } from './request-correlation.middleware';

const validRequestId = '9c52a51c-5d11-4b8a-99c8-34ea773fa93e';

/** Confirms valid IDs are retained while missing or invalid values are replaced. */
function verifiesRequestIdResolution(): void {
  expect(resolveRequestId(validRequestId)).toBe(validRequestId);
  expect(isUUID(resolveRequestId('not-a-uuid'))).toBe(true);
  expect(isUUID(resolveRequestId(undefined))).toBe(true);
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
