/**
 * @fileoverview Verifies safe Worker task correlation log entries.
 */

import { expect, test } from 'vitest';

import { createWorkerLogEntry } from './worker-log-context';

/** Confirms task correlation fields are retained without accepting arbitrary payload data. */
function preservesTaskCorrelation(): void {
  const entry = createWorkerLogEntry({
    event: 'workflow.node.started',
    jobId: 'job-42',
    requestId: '9c52a51c-5d11-4b8a-99c8-34ea773fa93e',
    runId: '75d93dd1-f6c4-48d9-aa45-52c76ce0ac47',
  });
  expect(Object.keys(entry).sort()).toEqual(['event', 'jobId', 'requestId', 'runId', 'service']);
}

/** Confirms lifecycle logs omit correlation keys rather than emitting ambiguous nulls. */
function omitsAbsentCorrelation(): void {
  expect(createWorkerLogEntry({ event: 'worker.lifecycle.ready' })).toEqual({
    event: 'worker.lifecycle.ready',
    service: 'worker',
  });
}

test('preserves Worker task correlation fields', preservesTaskCorrelation);
test('omits absent Worker task correlation fields', omitsAbsentCorrelation);
