/**
 * @fileoverview 用伪节点执行器验证引擎的状态转移与循环上限。
 */

import { describe, expect, test } from 'vitest';

import type { WorkflowNodeType } from '@everlearn/agent-runtime';

import { runWorkflowDefinition } from './workflow-engine';
import type { WorkflowNodeExecutor, WorkflowNodeOutcome } from './workflow-engine';

/** 用于构造合法定义。 */
function definition(edges: { from: string; to: string }[], ids: { id: string; type: string }[]) {
  return {
    edges,
    nodes: ids.map((node) => ({ config: {}, id: node.id, type: node.type as WorkflowNodeType })),
    version: 1 as const,
  };
}

/** 用于构造顺序三节点图的合法定义。 */
function sequentialGraph() {
  return definition(
    [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'end' },
    ],
    [
      { id: 'a', type: 'kb.read' },
      { id: 'b', type: 'llm.generate' },
      { id: 'end', type: 'workflow.end' },
    ],
  );
}

/** 用于创建按脚本回放的伪执行器。 */
function scriptedExecutor(script: Record<string, 'fail' | 'ok'>): WorkflowNodeExecutor {
  return {
    /** 按节点脚本回放成功或失败结果。 */
    execute: (node): Promise<WorkflowNodeOutcome> =>
      Promise.resolve(
        script[node.id] === 'fail'
          ? { errorCode: 'NODE_TEST_FAILED', message: '节点失败', status: 'failed' }
          : { output: `out:${node.id}`, status: 'succeeded' },
      ),
  };
}

/** 用于收集引擎事件的只读钩子。 */
function eventCollector(): {
  events: { nodeId: string; seq: number; status: string }[];
  onNodeEvent: (event: { nodeId: string; seq: number; status: string }) => Promise<void>;
} {
  const events: { nodeId: string; seq: number; status: string }[] = [];
  return {
    events,
    /** 把节点事件推入收集列表。 */
    onNodeEvent: (event) => {
      events.push({ nodeId: event.nodeId, seq: event.seq, status: event.status });
      return Promise.resolve();
    },
  };
}

describe('runWorkflowDefinition', () => {
  test('顺序图按序执行并在终点成功', async () => {
    const hooks = eventCollector();
    const result = await runWorkflowDefinition(sequentialGraph(), scriptedExecutor({}), hooks);
    expect(result.errorCode).toBeUndefined();
    expect(result.outputSummary).toContain('out:end');
    expect(hooks.events.map((event) => event.nodeId)).toEqual(['a', 'b', 'end']);
    expect(hooks.events.map((event) => event.seq)).toEqual([1, 2, 3]);
  });

  test('节点失败时停止后续执行并返回错误码', async () => {
    const hooks = eventCollector();
    const result = await runWorkflowDefinition(
      sequentialGraph(),
      scriptedExecutor({ b: 'fail' }),
      hooks,
    );
    expect(result.errorCode).toBe('WORKFLOW_NODE_FAILED');
    expect(hooks.events.at(-1)?.nodeId).toBe('b');
    expect(hooks.events.map((event) => event.nodeId)).not.toContain('end');
  });

  test('终点不可达时返回图非法错误码', async () => {
    const result = await runWorkflowDefinition(
      definition(
        [{ from: 'a', to: 'b' }],
        [
          { id: 'a', type: 'kb.read' },
          { id: 'b', type: 'llm.generate' },
          { id: 'end', type: 'workflow.end' },
        ],
      ),
      scriptedExecutor({}),
      eventCollector(),
    );
    expect(result.errorCode).toBe('WORKFLOW_GRAPH_INVALID');
  });
});
