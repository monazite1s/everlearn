/**
 * @fileoverview 请求 Workflows API 并收窄为本 feature 的局部投影。
 */
// 待后续并入 packages/contracts，禁止在并入前被其他 feature 复用。

import { isRecord, requestApi, type ApiResult } from '../../shared/api-request';

/** 工作流列表条目的局部投影。 */
export interface WorkflowItem {
  readonly createdAt: string;
  readonly draftUpdatedAt: string;
  readonly id: string;
  readonly latestRunStatus: string | null;
  readonly name: string;
  readonly publishedVersion: number | null;
}

/** 运行条目的局部投影。 */
export interface WorkflowRunItem {
  readonly createdAt: string;
  readonly errorCode: string | null;
  readonly id: string;
  readonly outputSummary: string | null;
  readonly status: string;
}

const KNOWN_CODES = [
  'INTERNAL_ERROR',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'WORKFLOW_DEFINITION_INVALID',
] as const;
export type WorkflowApiErrorCode = (typeof KNOWN_CODES)[number];

const RUN_KEYS = ['createdAt', 'errorCode', 'id', 'outputSummary', 'status'] as const;

/** 用于只读状态闭集内的安全状态值。 */
function runStatus(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** 用于把未知响应收窄为工作流列表投影。 */
export function parseWorkflowList(value: unknown): WorkflowItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: WorkflowItem[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.name !== 'string' || typeof entry.id !== 'string')
      return undefined;
    items.push({
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
      draftUpdatedAt: typeof entry.draftUpdatedAt === 'string' ? entry.draftUpdatedAt : '',
      id: entry.id,
      latestRunStatus: runStatus(entry.latestRunStatus),
      name: entry.name,
      publishedVersion: typeof entry.publishedVersion === 'number' ? entry.publishedVersion : null,
    });
  }
  return items;
}

/** 用于把未知响应收窄为运行列表投影。 */
export function parseRunList(value: unknown): WorkflowRunItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: WorkflowRunItem[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string') return undefined;
    if (RUN_KEYS.some((key) => !(key in entry))) return undefined;
    items.push({
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : '',
      errorCode: runStatus(entry.errorCode),
      id: entry.id,
      outputSummary: runStatus(entry.outputSummary),
      status: entry.status as string,
    });
  }
  return items;
}

/** 用于列出工作流。 */
export function listWorkflows(): Promise<ApiResult<WorkflowItem[], WorkflowApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    networkMessage: '无法连接工作流服务，请稍后重试。',
    parse: parseWorkflowList,
    url: '/api/v1/workflows',
  });
}

/** 用于创建工作流。 */
export function createWorkflow(name: string): Promise<ApiResult<unknown, WorkflowApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 201,
    init: {
      body: JSON.stringify({ name }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
    networkMessage: '无法创建工作流，请稍后重试。',
    /** 创建端点无响应体，投影固定为空对象。 */
    parse: () => ({}),
    url: '/api/v1/workflows',
  });
}

/** 用于保存模板草稿并发布。 */
export async function saveTemplateAndPublish(
  workflowId: string,
  definition: unknown,
): Promise<ApiResult<unknown, WorkflowApiErrorCode>> {
  const saved = await requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    init: {
      body: JSON.stringify({ draftDefinition: definition }),
      headers: { 'content-type': 'application/json' },
      method: 'PATCH',
    },
    networkMessage: '无法保存草稿，请稍后重试。',
    /** 更新端点无响应体，投影固定为空对象。 */
    parse: () => ({}),
    url: `/api/v1/workflows/${workflowId}`,
  });
  if (!saved.ok) return saved;
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    init: { headers: { 'content-type': 'application/json' }, method: 'POST' },
    networkMessage: '无法发布工作流，请稍后重试。',
    /** 发布端点无响应体，投影固定为空对象。 */
    parse: () => ({}),
    url: `/api/v1/workflows/${workflowId}/publish`,
  });
}

/** 用于触发一次运行。 */
export function startWorkflowRun(
  workflowId: string,
): Promise<ApiResult<unknown, WorkflowApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    init: { headers: { 'content-type': 'application/json' }, method: 'POST' },
    networkMessage: '无法启动运行，请稍后重试。',
    /** 运行端点无响应体，投影固定为空对象。 */
    parse: () => ({}),
    url: `/api/v1/workflows/${workflowId}/runs`,
  });
}

/** 用于列出新近运行。 */
export function listRuns(
  workflowId: string,
): Promise<ApiResult<WorkflowRunItem[], WorkflowApiErrorCode>> {
  return requestApi({
    codes: KNOWN_CODES,
    expectedStatus: 200,
    networkMessage: '无法读取运行记录，请稍后重试。',
    parse: parseRunList,
    url: `/api/v1/workflows/${workflowId}/runs`,
  });
}
