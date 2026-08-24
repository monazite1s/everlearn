/** @fileoverview 将服务端已验证的 ProseMirror 正文确定性投影为可持久化搜索块。 */

import { createHash } from 'node:crypto';

import {
  loadDocumentContentRules,
  type DocumentContentRules,
  validateDocumentContent,
} from '../documents/document-content.validator';

/** Search 仓储可直接补充文档归属与版本后持久化的块草稿。 */
export interface SearchBlockDraft {
  readonly blockId: string;
  readonly blockOrder: number;
  readonly contentHash: string;
  readonly headingPath: readonly string[];
  readonly text: string;
}

/** 解析时需要读取的最小 ProseMirror 节点形态。 */
interface ParsedNode {
  readonly attrs?: Readonly<Record<string, unknown>>;
  readonly content?: readonly unknown[];
  readonly text?: string;
  readonly type: string;
}

/** 深度优先遍历栈中的节点与文档深度。 */
interface PendingNode {
  readonly depth: number;
  readonly value: unknown;
}

/** 遍历过程中累积的搜索块和当前标题路径。 */
interface ProjectionState {
  readonly drafts: SearchBlockDraft[];
  headingPath: string[];
}

/** 用于区分普通对象与数组、null 等伪对象。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 用于按共享节点闭集和深度上限读取安全的最小节点形态。 */
function readNode(
  value: unknown,
  depth: number,
  rules: DocumentContentRules,
): ParsedNode | undefined {
  if (depth > rules.maxDepth || !isPlainObject(value) || typeof value.type !== 'string') {
    return undefined;
  }
  if (!rules.nodeTypes.has(value.type)) {
    return undefined;
  }
  if (value.content !== undefined && !Array.isArray(value.content)) {
    return undefined;
  }
  return value as unknown as ParsedNode;
}

/** 用于按正文校验器相同规则递归折叠 text 与 hardBreak。 */
function collectNodeText(
  value: unknown,
  depth: number,
  rules: DocumentContentRules,
): string | undefined {
  const node = readNode(value, depth, rules);
  if (node === undefined) return undefined;
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : undefined;
  if (node.type === 'hardBreak') return '\n';
  if (node.content === undefined) return '';
  const parts: string[] = [];
  for (const child of node.content) {
    const text = collectNodeText(child, depth + 1, rules);
    if (text === undefined) return undefined;
    parts.push(text);
  }
  return parts.join(node.type === 'doc' ? '\n\n' : '');
}

/** 用于从块属性读取合法的可引用节点标识。 */
function readBlockId(node: ParsedNode, rules: DocumentContentRules): string | undefined {
  const blockId = node.attrs?.blockId;
  return typeof blockId === 'string' && rules.blockIdPattern.test(blockId) ? blockId : undefined;
}

/** 用于读取标题层级，缺失时采用 Tiptap 的一级标题默认值。 */
function readHeadingLevel(node: ParsedNode, rules: DocumentContentRules): number | undefined {
  const level = node.attrs?.level ?? 1;
  return typeof level === 'number' && rules.headingLevels.has(level) ? level : undefined;
}

/** 用于对无歧义序列化后的正文与标题路径计算稳定 SHA-256。 */
function hashContent(text: string, headingPath: readonly string[]): string {
  return createHash('sha256')
    .update(JSON.stringify([text, headingPath]), 'utf8')
    .digest('hex');
}

/** 用于把子节点逆序压栈，从而保持原始文档的深度优先前序。 */
function pushChildren(stack: PendingNode[], node: ParsedNode, depth: number): void {
  if (node.content === undefined) return;
  for (let index = node.content.length - 1; index >= 0; index -= 1) {
    stack.push({ depth: depth + 1, value: node.content[index] });
  }
}

/** 用于投影当前块并在标题出现时推进后续块继承的路径。 */
function projectNode(
  node: ParsedNode,
  text: string,
  rules: DocumentContentRules,
  state: ProjectionState,
): boolean {
  if (node.type === 'heading') {
    const level = readHeadingLevel(node, rules);
    if (level === undefined) return false;
    state.headingPath = state.headingPath.slice(0, level - 1);
  }
  const blockId = rules.blockTypes.has(node.type) ? readBlockId(node, rules) : undefined;
  if (blockId !== undefined && text !== '') {
    const blockHeadingPath = [...state.headingPath];
    state.drafts.push({
      blockId,
      blockOrder: state.drafts.length,
      contentHash: hashContent(text, blockHeadingPath),
      headingPath: blockHeadingPath,
      text,
    });
  }
  if (node.type === 'heading' && text !== '') state.headingPath.push(text);
  return true;
}

/**
 * 将服务端已验证正文按可引用块投影；非法根、节点或过深输入返回 undefined。
 * 标题块记录父级路径，随后更新路径供其后按文档顺序出现的块继承。
 */
export async function parseSearchBlocks(
  value: unknown,
): Promise<readonly SearchBlockDraft[] | undefined> {
  const rules = await loadDocumentContentRules();
  const validated = validateDocumentContent(value, rules);
  if (validated === undefined) return undefined;
  const root = readNode(validated.contentJson, 0, rules);
  if (root?.type !== 'doc') return undefined;
  const state: ProjectionState = { drafts: [], headingPath: [] };
  const stack: PendingNode[] = [{ depth: 0, value: root }];
  while (stack.length > 0) {
    const pending = stack.pop()!;
    const node = readNode(pending.value, pending.depth, rules);
    const rawText = collectNodeText(pending.value, pending.depth, rules);
    if (node === undefined || rawText === undefined) return undefined;
    const text = rawText.trim();
    if (!projectNode(node, text, rules, state)) return undefined;
    pushChildren(stack, node, pending.depth);
  }
  return state.drafts;
}
