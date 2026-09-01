/**
 * @fileoverview 按拓扑顺序执行已校验 Workflow 定义的纯引擎。
 */

import { MAX_NODE_VISITS } from '@everlearn/agent-runtime';
import type { WorkflowDefinition, WorkflowNode } from '@everlearn/agent-runtime';

/** 单个节点执行结果。 */
export interface WorkflowNodeOutcome {
  readonly errorCode?: string;
  readonly message?: string;
  readonly output?: string;
  readonly status: 'failed' | 'succeeded';
}

/** 运行上下文：保存各节点输出供后续节点引用。 */
export type WorkflowRunContextState = ReadonlyMap<string, string>;

/** 引擎依赖的节点执行器边界。 */
export interface WorkflowNodeExecutor {
  execute(node: WorkflowNode, context: WorkflowRunContextState): Promise<WorkflowNodeOutcome>;
}

/** 引擎可变执行状态。 */
interface EngineState {
  context: Map<string, string>;
  failed: string | null;
  inDegree: Map<string, number>;
  outputs: Map<string, 'failed' | 'succeeded'>;
  seq: { value: number };
  visits: Map<string, number>;
}

/** 节点事件回调载荷。 */
export interface WorkflowNodeEvent {
  readonly message?: string;
  readonly nodeId: string;
  readonly seq: number;
  readonly status: 'failed' | 'running' | 'succeeded';
}

/** 引擎执行钩子：事件持久化由调用方负责。 */
export interface WorkflowEngineHooks {
  readonly onNodeEvent: (event: WorkflowNodeEvent) => Promise<void>;
}

/** 用于汇总节点输出供结束节点生成摘要。 */
function summarize(context: WorkflowRunContextState): string {
  const parts = [...context.entries()].map(([id, output]) => `${id}: ${output}`);
  return parts.join('\n').slice(0, 2000);
}

/** 用于按邻接表收集从起点可达的节点集合。 */
function reachable(adjacency: Map<string, readonly string[]>, start: string): Set<string> {
  const visited = new Set<string>();
  const queue = [start];
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) queue.push(next);
  }
  return visited;
}

/** 用于顺序执行就绪节点：失败即终止整个运行。 */
async function drainReadyNodes(
  definition: WorkflowDefinition,
  executor: WorkflowNodeExecutor,
  hooks: WorkflowEngineHooks,
  state: EngineState,
): Promise<void> {
  const nodes = new Map(definition.nodes.map((node) => [node.id, node]));
  for (;;) {
    const ready = [...state.inDegree.entries()]
      .filter(([id, degree]) => degree === 0 && !state.outputs.has(id))
      .map(([id]) => id);
    if (ready.length === 0) return;
    for (const nodeId of ready) {
      const outcome = await executeNode(nodes.get(nodeId)!, state, executor, hooks);
      if (outcome === 'stop') return;
    }
    // 推进就绪集合：把已完成节点的后继入度减一。
    for (const nodeId of ready) {
      for (const edge of definition.edges) {
        if (edge.from === nodeId) {
          state.inDegree.set(edge.to, (state.inDegree.get(edge.to) ?? 1) - 1);
        }
      }
    }
  }
}

/** 用于执行单个节点：返回 stop 表示运行应终止。 */
async function executeNode(
  node: WorkflowNode,
  state: EngineState,
  executor: WorkflowNodeExecutor,
  hooks: WorkflowEngineHooks,
): Promise<'continue' | 'stop'> {
  const visits = (state.visits.get(node.id) ?? 0) + 1;
  state.visits.set(node.id, visits);
  if (visits > MAX_NODE_VISITS) {
    state.failed = node.id;
    await hooks.onNodeEvent({
      message: `节点进入次数超过上限 ${MAX_NODE_VISITS}`,
      nodeId: node.id,
      seq: (state.seq.value += 1),
      status: 'failed',
    });
    return 'stop';
  }
  const outcome = await executor.execute(node, state.context);
  if (outcome.output !== undefined) state.context.set(node.id, outcome.output);
  await hooks.onNodeEvent({
    ...(outcome.message === undefined ? {} : { message: outcome.message }),
    nodeId: node.id,
    seq: (state.seq.value += 1),
    status: outcome.status,
  });
  state.outputs.set(node.id, outcome.status);
  if (outcome.status === 'failed') state.failed = node.id;
  return outcome.status === 'failed' ? 'stop' : 'continue';
}

/** 用于校验图结构：返回唯一起点与可达终点，非法时返回稳定错误码。 */
function validateGraph(
  definition: WorkflowDefinition,
): { endNode: WorkflowNode; inDegree: Map<string, number> } | { error: string } {
  const inDegree = new Map<string, number>();
  for (const node of definition.nodes) inDegree.set(node.id, 0);
  for (const edge of definition.edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1);
  }
  const startCandidates = [...inDegree.entries()].filter(([, degree]) => degree === 0);
  if (startCandidates.length !== 1) return { error: 'WORKFLOW_GRAPH_INVALID' };
  const endNode = definition.nodes.find((node) => node.type === 'workflow.end');
  if (endNode === undefined) return { error: 'WORKFLOW_GRAPH_INVALID' };
  const outgoing = new Map<string, string[]>();
  for (const node of definition.nodes) outgoing.set(node.id, []);
  for (const edge of definition.edges) outgoing.get(edge.from)!.push(edge.to);
  if (!reachable(outgoing, startCandidates[0]![0]).has(endNode.id)) {
    return { error: 'WORKFLOW_GRAPH_INVALID' };
  }
  return { endNode, inDegree };
}

/** 用于执行整张图并返回输出摘要或稳定错误码。 */
export async function runWorkflowDefinition(
  definition: WorkflowDefinition,
  executor: WorkflowNodeExecutor,
  hooks: WorkflowEngineHooks,
): Promise<{ errorCode?: string; outputSummary?: string }> {
  const validated = validateGraph(definition);
  if ('error' in validated) return { errorCode: validated.error };
  const state = {
    context: new Map<string, string>(),
    failed: null as string | null,
    inDegree: validated.inDegree,
    outputs: new Map<string, 'failed' | 'succeeded'>(),
    seq: { value: 0 },
    visits: new Map<string, number>(),
  };
  await drainReadyNodes(definition, executor, hooks, state);
  if (state.failed !== null) return { errorCode: 'WORKFLOW_NODE_FAILED' };
  if (state.outputs.get(validated.endNode.id) !== 'succeeded') {
    return { errorCode: 'WORKFLOW_INCOMPLETE' };
  }
  return { outputSummary: summarize(state.context) };
}
