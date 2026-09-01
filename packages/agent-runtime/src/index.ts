/**
 * @fileoverview 定义 Agent 与 Workflow 运行时原语的公开边界。
 */

export {
  MAX_NODE_VISITS,
  WORKFLOW_NODE_TYPES,
  parseWorkflowDefinition,
  validateWorkflowDefinition,
} from './workflow-definition.js';
export type {
  WorkflowDefinition,
  WorkflowDefinitionIssue,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeConfig,
  WorkflowNodeType,
  WorkflowValidationResult,
} from './workflow-definition.js';
