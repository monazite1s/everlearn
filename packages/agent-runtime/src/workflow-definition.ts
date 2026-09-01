/**
 * @fileoverview 定义版本化 Workflow 图结构的 Schema 校验与公开类型。
 */

import { z } from 'zod';

/** 单节点在循环执行中的最大进入次数。 */
export const MAX_NODE_VISITS = 10;

/** 允许的节点类型闭集，产品规格明确排除 HTTP/脚本/代码节点。 */
export const WORKFLOW_NODE_TYPES = [
  'kb.read',
  'llm.generate',
  'doc.create',
  'workflow.end',
] as const;

export type WorkflowNodeType = (typeof WORKFLOW_NODE_TYPES)[number];

/** 单个节点的最小配置形态，具体字段由执行端按类型解释。 */
export type WorkflowNodeConfig = Readonly<Record<string, string | number | boolean | null>>;

/** 图中一个节点的稳定公开形态。 */
export interface WorkflowNode {
  readonly config: WorkflowNodeConfig;
  readonly id: string;
  readonly type: WorkflowNodeType;
}

/** 图中一条有向边。 */
export interface WorkflowEdge {
  readonly from: string;
  readonly to: string;
}

/** 版本化 Workflow 定义的稳定公开形态。 */
export interface WorkflowDefinition {
  readonly edges: readonly WorkflowEdge[];
  readonly nodes: readonly WorkflowNode[];
  readonly version: 1;
}

/** 单条可定位的校验错误。 */
export interface WorkflowDefinitionIssue {
  readonly message: string;
  readonly path: string;
}

/** 校验结果：合法时返回定义，非法时返回可定位错误列表。 */
export type WorkflowValidationResult =
  | { readonly definition: WorkflowDefinition; readonly ok: true }
  | { readonly issues: readonly WorkflowDefinitionIssue[]; readonly ok: false };

const workflowNodeConfigSchema: z.ZodType<WorkflowNodeConfig> = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

const workflowDefinitionSchema = z.object({
  edges: z
    .array(z.object({ from: z.string().min(1).max(64), to: z.string().min(1).max(64) }))
    .max(64),
  nodes: z
    .array(
      z.object({
        config: workflowNodeConfigSchema,
        id: z.string().min(1).max(64),
        type: z.enum(WORKFLOW_NODE_TYPES),
      }),
    )
    .min(1)
    .max(64),
  version: z.literal(1),
});

/** 用于把节点标记为从起点可达或可到达终点。 */
function collectReachable(
  adjacency: Map<string, readonly string[]>,
  startIds: readonly string[],
): Set<string> {
  const visited = new Set<string>();
  const queue = [...startIds];
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) queue.push(next);
  }
  return visited;
}

/** 用于按方向把边整理为邻接表。 */
function buildAdjacency(
  definition: WorkflowDefinition,
  direction: 'forward' | 'reverse',
): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const node of definition.nodes) adjacency.set(node.id, []);
  for (const edge of definition.edges) {
    const source = direction === 'forward' ? edge.from : edge.to;
    const target = direction === 'forward' ? edge.to : edge.from;
    adjacency.get(source)!.push(target);
  }
  return adjacency;
}

/** 用于校验结构合法前提下的图级约束并返回错误列表。 */
function collectGraphIssues(definition: WorkflowDefinition): WorkflowDefinitionIssue[] {
  const issues: WorkflowDefinitionIssue[] = [];
  const ids = definition.nodes.map((node) => node.id);
  for (const id of new Set(ids.filter((id, index) => ids.indexOf(id) !== index))) {
    issues.push({ message: `节点 ID 重复：${id}`, path: `nodes.${id}` });
  }
  const knownIds = new Set(ids);
  for (const [index, edge] of definition.edges.entries()) {
    if (!knownIds.has(edge.from))
      issues.push({ message: `边引用了不存在的起点：${edge.from}`, path: `edges.${index}.from` });
    if (!knownIds.has(edge.to))
      issues.push({ message: `边引用了不存在的终点：${edge.to}`, path: `edges.${index}.to` });
  }
  if (issues.length > 0) return issues;
  return collectEndpointIssues(definition);
}

/** 用于校验唯一起点、唯一终点与可达性约束。 */
function collectEndpointIssues(definition: WorkflowDefinition): WorkflowDefinitionIssue[] {
  const issues: WorkflowDefinitionIssue[] = [];
  const outgoing = buildAdjacency(definition, 'forward');
  const incoming = buildAdjacency(definition, 'reverse');
  const startIds = definition.nodes
    .map((node) => node.id)
    .filter((id) => (incoming.get(id) ?? []).length === 0);
  const endNodes = definition.nodes.filter((node) => node.type === 'workflow.end');
  if (startIds.length !== 1) {
    issues.push({ message: `图必须恰有一个起点，实际为 ${startIds.length} 个`, path: 'edges' });
    return issues;
  }
  if (endNodes.length !== 1) {
    issues.push({ message: '图必须恰有一个 workflow.end 节点', path: 'nodes' });
    return issues;
  }
  const reachableFromStart = collectReachable(outgoing, [startIds[0]!]);
  const canReachEnd = collectReachable(incoming, [endNodes[0]!.id]);
  for (const node of definition.nodes) {
    if (!reachableFromStart.has(node.id))
      issues.push({ message: `节点从起点不可达：${node.id}`, path: `nodes.${node.id}` });
    if (!canReachEnd.has(node.id))
      issues.push({
        message: `节点没有到 workflow.end 的路径：${node.id}`,
        path: `nodes.${node.id}`,
      });
  }
  return issues;
}

/** 用于校验未知输入并返回可定位的结构化结果。 */
export function validateWorkflowDefinition(input: unknown): WorkflowValidationResult {
  const parsed = workflowDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      issues: parsed.error.issues.map((issue) => ({
        message: issue.message,
        path: issue.path.map(String).join('.'),
      })),
      ok: false,
    };
  }
  const candidate = parsed.data as WorkflowDefinition;
  const graphIssues = collectGraphIssues(candidate);
  if (graphIssues.length > 0) return { issues: graphIssues, ok: false };
  return { definition: candidate, ok: true };
}

/** 用于解析并校验定义，非法时抛出携带错误路径的异常。 */
export function parseWorkflowDefinition(input: unknown): WorkflowDefinition {
  const result = validateWorkflowDefinition(input);
  if (!result.ok) {
    const detail = result.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    throw new Error(`Workflow 定义非法：${detail}`);
  }
  return result.definition;
}
