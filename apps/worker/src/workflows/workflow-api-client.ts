/**
 * @fileoverview 封装 Worker 调用 Workflow 内部端点的 HTTP 客户端。
 */

const REQUEST_TIMEOUT_MS = 120_000;

/** 节点副作用端点的统一响应形态。 */
export interface WorkflowActionResult {
  readonly content?: string;
  readonly documentId?: string;
  readonly plainText?: string;
  readonly title?: string;
}

/** 运行上下文响应形态。 */
export interface WorkflowRunContextResponse {
  readonly definition: unknown;
  readonly runId: string;
  readonly status: string;
}

/** 运行事件请求形态。 */
export interface WorkflowRunEventInput {
  readonly message?: string;
  readonly nodeId: string;
  readonly seq: number;
  readonly status: 'failed' | 'running' | 'succeeded';
}

/** 带稳定错误码的响应失败。 */
export class WorkflowApiError extends Error {
  /** 用于保存公开错误码供运行终态记录。 */
  constructor(
    readonly errorCode: string,
    message: string,
  ) {
    super(message);
  }
}

/** 用于执行内部请求并把错误信封映射为稳定错误码。 */
async function callInternal(
  config: { apiInternalUrl: string; secret: string },
  path: string,
  init: { body?: unknown; method: 'GET' | 'POST' },
): Promise<unknown> {
  const base = config.apiInternalUrl.replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${base}/api/v1/internal/workflows${path}`, {
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      headers: { 'content-type': 'application/json', 'x-purge-secret': config.secret },
      method: init.method,
      signal: controller.signal,
    });
    if (response.status === 204) return undefined;
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const record =
        typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
      const code = typeof record.code === 'string' ? record.code : 'WORKFLOW_UPSTREAM_ERROR';
      throw new WorkflowApiError(code, `workflow endpoint ${path} responded ${response.status}`);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** 用于领取一批待执行运行。 */
export async function dispatchWorkflowRuns(
  config: { apiInternalUrl: string; secret: string },
  limit: number,
): Promise<readonly { definition: unknown; runId: string }[]> {
  const result = await callInternal(config, '/dispatch', { body: { limit }, method: 'POST' });
  return Array.isArray(result) ? (result as { definition: unknown; runId: string }[]) : [];
}

/** 用于读取运行及其冻结定义。 */
export async function fetchRunContext(
  config: { apiInternalUrl: string; secret: string },
  runId: string,
): Promise<WorkflowRunContextResponse> {
  return (await callInternal(config, `/runs/${runId}/context`, {
    method: 'GET',
  })) as WorkflowRunContextResponse;
}

/** 用于追加节点事件。 */
export async function postRunEvent(
  config: { apiInternalUrl: string; secret: string },
  runId: string,
  event: WorkflowRunEventInput,
): Promise<void> {
  await callInternal(config, `/runs/${runId}/events`, { body: event, method: 'POST' });
}

/** 用于写入运行终态。 */
export async function completeRun(
  config: { apiInternalUrl: string; secret: string },
  runId: string,
  input: { errorCode?: string; outputSummary?: string; status: 'failed' | 'succeeded' },
): Promise<void> {
  await callInternal(config, `/runs/${runId}/complete`, { body: { ...input }, method: 'POST' });
}

/** 用于执行知识库读取节点。 */
export async function readKbDocument(
  config: { apiInternalUrl: string; secret: string },
  documentId: string,
): Promise<WorkflowActionResult> {
  return (await callInternal(config, '/actions/kb-read', {
    body: { documentId },
    method: 'POST',
  })) as WorkflowActionResult;
}

/** 用于执行文档创建节点。 */
export async function createDocument(
  config: { apiInternalUrl: string; secret: string },
  input: {
    knowledgeBaseId: string;
    nodeId: string;
    plainText: string;
    runId: string;
    title: string;
  },
): Promise<WorkflowActionResult> {
  return (await callInternal(config, '/actions/doc-create', {
    body: input,
    method: 'POST',
  })) as WorkflowActionResult;
}

/** 用于执行 LLM 生成节点。 */
export async function completeLlm(
  config: { apiInternalUrl: string; secret: string },
  prompt: string,
): Promise<WorkflowActionResult> {
  return (await callInternal(config, '/actions/llm', {
    body: { prompt },
    method: 'POST',
  })) as WorkflowActionResult;
}

/** 用于把中断遗留的运行复位为待执行。 */
export async function recoverInterruptedRuns(config: {
  apiInternalUrl: string;
  secret: string;
}): Promise<readonly string[]> {
  const result = await callInternal(config, '/runs/recover', { method: 'POST' });
  const record =
    typeof result === 'object' && result !== null ? (result as Record<string, unknown>) : {};
  return Array.isArray(record.recoveredRunIds) ? (record.recoveredRunIds as string[]) : [];
}

/** 用于列出启用计划的工作流。 */
export async function listWorkflowSchedules(config: {
  apiInternalUrl: string;
  secret: string;
}): Promise<
  readonly { schedule: { kind: string; time: string; timezone: string }; workflowId: string }[]
> {
  const result = await callInternal(config, '/schedules', { method: 'GET' });
  return Array.isArray(result)
    ? (result as {
        schedule: { kind: string; time: string; timezone: string };
        workflowId: string;
      }[])
    : [];
}

/** 用于为计划触发创建或复用活跃运行。 */
export async function createScheduledRun(
  config: { apiInternalUrl: string; secret: string },
  workflowId: string,
): Promise<{ runId: string }> {
  return (await callInternal(config, '/scheduled-runs', {
    body: { workflowId },
    method: 'POST',
  })) as { runId: string };
}
