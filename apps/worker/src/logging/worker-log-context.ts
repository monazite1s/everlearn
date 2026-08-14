/**
 * @fileoverview 构造带可选任务关联标识的安全 Worker 日志。
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

/** 用于加入稳定服务标识并排除任务载荷和密钥字段。 */
export function createWorkerLogEntry(input: WorkerLogInput): WorkerLogEntry {
  return {
    event: input.event,
    ...(input.jobId === undefined ? {} : { jobId: input.jobId }),
    ...(input.requestId === undefined ? {} : { requestId: input.requestId }),
    ...(input.runId === undefined ? {} : { runId: input.runId }),
    service: 'worker',
  };
}
