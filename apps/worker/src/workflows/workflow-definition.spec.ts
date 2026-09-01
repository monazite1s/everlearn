/**
 * @fileoverview 验证 Workflow 定义校验器对合法与非法图的判定。
 */

import { describe, expect, test } from 'vitest';

import { validateWorkflowDefinition } from '@everlearn/agent-runtime';

/** 用于构造一条「读文档 → LLM → 结束」的合法定义。 */
function linearDefinition(): Record<string, unknown> {
  return {
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'end' },
    ],
    nodes: [
      { config: { documentId: 'd1' }, id: 'a', type: 'kb.read' },
      { config: { prompt: '总结 {{a}}' }, id: 'b', type: 'llm.generate' },
      { config: {}, id: 'end', type: 'workflow.end' },
    ],
    version: 1,
  };
}

/** 用于收集校验错误的可读消息。 */
function issueMessages(issues: readonly { message: string }[]): string {
  return issues.map((issue) => issue.message).join('; ');
}

describe('validateWorkflowDefinition', () => {
  test('接受带分支的合法图并保留节点信息', () => {
    const result = validateWorkflowDefinition({
      edges: [
        { from: 'a', to: 'b' },
        { from: 'a', to: 'c' },
        { from: 'b', to: 'end' },
        { from: 'c', to: 'end' },
      ],
      nodes: [
        { config: { documentId: 'd1' }, id: 'a', type: 'kb.read' },
        { config: { prompt: '总结 {{a}}' }, id: 'b', type: 'llm.generate' },
        { config: { knowledgeBaseId: 'kb1', title: 't' }, id: 'c', type: 'doc.create' },
        { config: {}, id: 'end', type: 'workflow.end' },
      ],
      version: 1,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.definition.nodes).toHaveLength(4);
  });

  test('拒绝未知节点类型', () => {
    const definition = linearDefinition() as { nodes: { type: string }[] };
    definition.nodes[1]!.type = 'http.call';
    const result = validateWorkflowDefinition(definition);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(issueMessages(result.issues)).toMatch(/doc\.create/);
  });

  test('拒绝重复节点 ID 与悬挂边', () => {
    const duplicated = linearDefinition() as { nodes: { id: string }[] };
    duplicated.nodes[1]!.id = 'a';
    expect(validateWorkflowDefinition(duplicated).ok).toBe(false);

    const dangling = linearDefinition() as { edges: { to: string }[] };
    dangling.edges[1]!.to = 'missing';
    expect(validateWorkflowDefinition(dangling).ok).toBe(false);
  });

  test('拒绝缺少终点路径与多起点的图', () => {
    const noEndPath = linearDefinition() as { edges: unknown[] };
    noEndPath.edges.pop();
    expect(validateWorkflowDefinition(noEndPath).ok).toBe(false);

    const twoStarts = linearDefinition() as { edges: unknown[] };
    twoStarts.edges.shift();
    expect(validateWorkflowDefinition(twoStarts).ok).toBe(false);
  });
});
