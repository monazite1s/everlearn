/**
 * @fileoverview 定义 Workflow 模块的 HTTP 响应投影并汇聚请求边界。
 */

export { CreateWorkflowDto } from './workflow-create.dto';
export { AppendWorkflowRunEventDto } from './workflow-run-event.dto';
export { CompleteWorkflowRunDto } from './workflow-run-complete.dto';
export { RunParamDto } from './workflow-run-param.dto';
export { WorkflowScheduleDto } from './workflow-schedule.dto';
export { UpdateWorkflowDto } from './workflow-update.dto';

/** workflow 列表与详情的公开投影。 */
export interface WorkflowSummary {
  readonly createdAt: string;
  readonly draftUpdatedAt: string;
  readonly id: string;
  readonly latestRunStatus: 'canceled' | 'failed' | 'pending' | 'running' | 'succeeded' | null;
  readonly name: string;
  readonly publishedVersion: number | null;
  readonly schedule: unknown;
}

/** workflow 详情投影：列表投影加草稿定义。 */
export interface WorkflowDetail extends WorkflowSummary {
  readonly draftDefinition: unknown;
}

/** 发布结果投影。 */
export interface WorkflowPublishResult {
  readonly version: number;
  readonly versionId: string;
}

/** 运行事件投影。 */
export interface WorkflowRunEventView {
  readonly createdAt: string;
  readonly message: string | null;
  readonly nodeId: string;
  readonly seq: number;
  readonly status: string;
}

/** 运行摘要投影。 */
export interface WorkflowRunSummary {
  readonly createdAt: string;
  readonly errorCode: string | null;
  readonly id: string;
  readonly outputSummary: string | null;
  readonly status: string;
}

/** 运行详情投影：摘要加事件列表。 */
export interface WorkflowRunDetail extends WorkflowRunSummary {
  readonly events: readonly WorkflowRunEventView[];
}

/** Worker 领取待执行运行时的载荷。 */
export interface WorkflowDispatchItem {
  readonly definition: unknown;
  readonly runId: string;
}

/** Worker 读取的运行上下文。 */
export interface WorkflowRunContext {
  readonly definition: unknown;
  readonly runId: string;
  readonly status: string;
}

/** 计划条目投影。 */
export interface WorkflowScheduleItem {
  readonly schedule: {
    readonly kind: 'daily' | 'weekly';
    readonly time: string;
    readonly timezone: string;
  };
  readonly workflowId: string;
}
