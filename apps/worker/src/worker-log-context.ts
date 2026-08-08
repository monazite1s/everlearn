/**
 * @fileoverview Builds safe Worker log entries with optional task correlation identifiers.
 */

interface WorkerLogInput {
  event: string;
  jobId?: string;
  requestId?: string;
  runId?: string;
}

export interface WorkerLogEntry extends WorkerLogInput {
  service: 'worker';
}

/** Adds stable service identity without accepting job payloads or secret-bearing fields. */
export function createWorkerLogEntry(input: WorkerLogInput): WorkerLogEntry {
  return {
    event: input.event,
    ...(input.jobId === undefined ? {} : { jobId: input.jobId }),
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    ...(input.runId === undefined ? {} : { runId: input.runId }),
    service: 'worker',
  };
}
