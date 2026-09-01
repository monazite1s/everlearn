/**
 * @fileoverview 把 Workflow 节点映射到内部端点副作用并驱动纯引擎执行。
 */

import type { WorkflowDefinition, WorkflowNode } from '@everlearn/agent-runtime';

import {
  completeLlm,
  completeRun,
  createDocument,
  fetchRunContext,
  postRunEvent,
  readKbDocument,
  WorkflowApiError,
} from './workflow-api-client';
import { runWorkflowDefinition } from './workflow-engine';
import type { WorkflowNodeOutcome } from './workflow-engine';

/** 运行执行所需配置。 */
export interface WorkflowRunExecutorConfig {
  readonly apiInternalUrl: string;
  readonly secret: string;
}

/** 用于从节点配置读取字符串字段。 */
function configString(node: WorkflowNode, key: string): string {
  const value = node.config[key];
  return typeof value === 'string' ? value : '';
}

/** 用于把提示模板中的 {{nodeId}} 占位替换为上游输出。 */
function renderPrompt(template: string, context: ReadonlyMap<string, string>): string {
  return template.replace(/\{\{([\w.-]+)\}\}/gu, (match, id: string) => context.get(id) ?? match);
}

/** 用于执行知识库读取节点。 */
async function runKbRead(
  node: WorkflowNode,
  config: WorkflowRunExecutorConfig,
): Promise<WorkflowNodeOutcome> {
  const result = await readKbDocument(config, configString(node, 'documentId'));
  return { output: result.plainText ?? '', status: 'succeeded' };
}

/** 用于执行 LLM 生成节点：以上游输出渲染提示模板。 */
async function runLlmGenerate(
  node: WorkflowNode,
  context: ReadonlyMap<string, string>,
  config: WorkflowRunExecutorConfig,
): Promise<WorkflowNodeOutcome> {
  const prompt = renderPrompt(configString(node, 'prompt'), context);
  const result = await completeLlm(config, prompt);
  return { output: result.content ?? '', status: 'succeeded' };
}

/** 用于执行文档创建节点：源节点输出作为正文。 */
async function runDocCreate(
  node: WorkflowNode,
  context: ReadonlyMap<string, string>,
  runId: string,
  config: WorkflowRunExecutorConfig,
): Promise<WorkflowNodeOutcome> {
  const result = await createDocument(config, {
    knowledgeBaseId: configString(node, 'knowledgeBaseId'),
    plainText: context.get(configString(node, 'sourceNodeId')) ?? '',
    runId,
    title: configString(node, 'title'),
  });
  return { output: result.documentId ?? '', status: 'succeeded' };
}

/** 用于执行单节点并把领域错误映射为稳定错误码。 */
async function executeNode(
  node: WorkflowNode,
  context: ReadonlyMap<string, string>,
  runId: string,
  config: WorkflowRunExecutorConfig,
): Promise<WorkflowNodeOutcome> {
  const nodeType: string = node.type;
  try {
    if (nodeType === 'kb.read') return await runKbRead(node, config);
    if (nodeType === 'llm.generate') return await runLlmGenerate(node, context, config);
    if (nodeType === 'doc.create') return await runDocCreate(node, context, runId, config);
    if (nodeType === 'workflow.end') {
      return { output: [...context.values()].join('\n').slice(0, 2000), status: 'succeeded' };
    }
    return {
      errorCode: 'WORKFLOW_UNKNOWN_NODE',
      message: `未知节点类型：${nodeType}`,
      status: 'failed',
    };
  } catch (error) {
    const code = error instanceof WorkflowApiError ? error.errorCode : 'WORKFLOW_UPSTREAM_ERROR';
    return { errorCode: code, message: code, status: 'failed' };
  }
}

/** 用于执行一次运行并落事件与终态。 */
export async function executeWorkflowRun(
  runId: string,
  config: WorkflowRunExecutorConfig,
): Promise<void> {
  const contextResponse = await fetchRunContext(config, runId);
  if (contextResponse.status !== 'running') return;
  const definition = contextResponse.definition as WorkflowDefinition;
  await runWorkflowDefinition(
    definition,
    {
      /** 用于把节点执行器接到内部副作用端点。 */
      execute: (node, context) => executeNode(node, context, runId, config),
    },
    {
      /** 用于把引擎事件持久化为运行事件流。 */
      onNodeEvent: (event) =>
        postRunEvent(config, runId, {
          ...(event.message === undefined ? {} : { message: event.message }),
          nodeId: event.nodeId,
          seq: event.seq,
          status: event.status,
        }),
    },
  )
    .then((result) =>
      completeRun(config, runId, {
        ...(result.errorCode === undefined ? {} : { errorCode: result.errorCode }),
        ...(result.outputSummary === undefined ? {} : { outputSummary: result.outputSummary }),
        status: result.errorCode === undefined ? 'succeeded' : 'failed',
      }),
    )
    .catch(async (error: unknown) => {
      const code = error instanceof WorkflowApiError ? error.errorCode : 'WORKFLOW_UPSTREAM_ERROR';
      await completeRun(config, runId, { errorCode: code, status: 'failed' });
    });
}
