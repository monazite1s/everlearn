/** @fileoverview 服务端逐节点校验正文 JSON 并在同次遍历派生纯文本。 */

import type { JsonValue } from '../database/database.types';

/** 服务端校验通过后的正文与派生纯文本。 */
export interface ValidatedDocumentContent {
  readonly contentJson: JsonValue;
  readonly plainText: string;
}

/** 服务端逐节点校验所需的共享契约常量集合。 */
export interface DocumentContentRules {
  readonly attachmentAltMaxLength: number;
  readonly attachmentFileNameMaxLength: number;
  readonly attachmentIdPattern: RegExp;
  readonly attachmentTypes: ReadonlySet<string>;
  readonly blockIdPattern: RegExp;
  readonly blockTypes: ReadonlySet<string>;
  readonly headingLevels: ReadonlySet<number>;
  readonly markTypes: ReadonlySet<string>;
  readonly maxDepth: number;
  readonly nodeTypes: ReadonlySet<string>;
  readonly schemaVersion: number;
}

/** 用于从共享契约加载常量并预构建校验用集合。 */
export async function loadDocumentContentRules(): Promise<DocumentContentRules> {
  const contracts = await import('@everlearn/contracts');
  return {
    attachmentAltMaxLength: contracts.ATTACHMENT_ALT_MAX_LENGTH,
    attachmentFileNameMaxLength: contracts.ATTACHMENT_FILE_NAME_MAX_LENGTH,
    // attachmentId 与 blockId 同为标准 UUID，直接复用既有格式常量。
    attachmentIdPattern: contracts.DOCUMENT_BLOCK_ID_PATTERN,
    attachmentTypes: new Set<string>(contracts.DOCUMENT_ATTACHMENT_NODE_TYPES),
    blockIdPattern: contracts.DOCUMENT_BLOCK_ID_PATTERN,
    blockTypes: new Set<string>(contracts.DOCUMENT_BLOCK_NODE_TYPES),
    headingLevels: new Set<number>(contracts.DOCUMENT_APPROVED_HEADING_LEVELS),
    markTypes: contracts.DOCUMENT_APPROVED_MARK_TYPES,
    maxDepth: contracts.DOCUMENT_JSON_MAX_DEPTH,
    nodeTypes: contracts.DOCUMENT_APPROVED_NODE_TYPES,
    schemaVersion: contracts.DOCUMENT_SCHEMA_VERSION,
  };
}

/** 用于区分普通对象与数组、null 等伪对象。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 用于校验标记类型专属属性：docLink 必须携带合法目标文档 UUID。 */
function passesMarkSpecificRules(
  mark: Record<string, unknown>,
  rules: DocumentContentRules,
): boolean {
  if (mark.type !== 'docLink') {
    return true;
  }
  if (!isPlainObject(mark.attrs)) {
    return false;
  }
  const documentId = mark.attrs.documentId;
  return typeof documentId === 'string' && rules.blockIdPattern.test(documentId);
}

/** 用于校验 marks 字段：批准标记名或带合法 type/attrs 的标记对象。 */
function isValidMarks(value: unknown, rules: DocumentContentRules): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every((mark) => {
    if (typeof mark === 'string') {
      return rules.markTypes.has(mark);
    }
    if (!isPlainObject(mark) || typeof mark.type !== 'string') {
      return false;
    }
    return (
      rules.markTypes.has(mark.type) &&
      (mark.attrs === undefined || isPlainObject(mark.attrs)) &&
      passesMarkSpecificRules(mark, rules)
    );
  });
}

/** 用于校验标题层级落在批准范围内，缺失时沿用 schema 默认层级。 */
function hasApprovedHeadingLevel(
  node: Record<string, unknown>,
  rules: DocumentContentRules,
): boolean {
  if (!isPlainObject(node.attrs)) {
    return true;
  }
  const level = node.attrs.level;
  return level === undefined || (typeof level === 'number' && rules.headingLevels.has(level));
}

/** 用于校验附件节点属性：必填合法 attachmentId，alt 与 fileName 可选受限字符串。 */
function hasValidAttachmentAttrs(
  node: Record<string, unknown>,
  rules: DocumentContentRules,
): boolean {
  if (!isPlainObject(node.attrs)) {
    return false;
  }
  const attachmentId = node.attrs.attachmentId;
  if (typeof attachmentId !== 'string' || !rules.attachmentIdPattern.test(attachmentId)) {
    return false;
  }
  const alt = node.attrs.alt;
  if (alt !== undefined && (typeof alt !== 'string' || alt.length > rules.attachmentAltMaxLength)) {
    return false;
  }
  const fileName = node.attrs.fileName;
  return (
    fileName === undefined ||
    (typeof fileName === 'string' && fileName.length <= rules.attachmentFileNameMaxLength)
  );
}

/** 用于校验节点类型专属属性：附件节点必填合法 attachmentId，标题节点限层级。 */
function passesTypeSpecificRules(
  node: Record<string, unknown>,
  rules: DocumentContentRules,
): boolean {
  if (typeof node.type === 'string' && rules.attachmentTypes.has(node.type)) {
    return hasValidAttachmentAttrs(node, rules);
  }
  if (node.type !== 'heading') {
    return true;
  }
  return hasApprovedHeadingLevel(node, rules);
}

/** 用于校验节点的 attrs、text 与 marks 字段形态及类型专属属性。 */
function isValidNodeShape(node: Record<string, unknown>, rules: DocumentContentRules): boolean {
  if (node.attrs !== undefined && !isPlainObject(node.attrs)) {
    return false;
  }
  if (node.text !== undefined && typeof node.text !== 'string') {
    return false;
  }
  if (node.marks !== undefined && !isValidMarks(node.marks, rules)) {
    return false;
  }
  return passesTypeSpecificRules(node, rules);
}

/** 用于要求块级节点携带文档内唯一的合法 blockId。 */
function hasUniqueBlockId(
  node: Record<string, unknown>,
  rules: DocumentContentRules,
  seenBlockIds: Set<string>,
): boolean {
  if (!isPlainObject(node.attrs)) {
    return false;
  }
  const blockId = node.attrs.blockId;
  if (typeof blockId !== 'string' || !rules.blockIdPattern.test(blockId)) {
    return false;
  }
  if (seenBlockIds.has(blockId)) {
    return false;
  }
  seenBlockIds.add(blockId);
  return true;
}

/** 用于返回叶子节点文本，text 折叠内容且 hardBreak 折叠为换行。 */
function leafNodeText(node: Record<string, unknown>): string | undefined {
  if (node.type === 'text') {
    return typeof node.text === 'string' ? node.text : undefined;
  }
  if (node.type === 'hardBreak') {
    return '\n';
  }
  return undefined;
}

/** 用于收集并拼接子节点文本，子节点非法时整体拒绝。 */
function collectChildText(
  node: Record<string, unknown>,
  depth: number,
  rules: DocumentContentRules,
  seenBlockIds: Set<string>,
): string | undefined {
  const parts: string[] = [];
  for (const child of node.content as readonly unknown[]) {
    const text = collectPlainText(child, depth + 1, rules, seenBlockIds);
    if (text === undefined) {
      return undefined;
    }
    parts.push(text);
  }
  return node.type === 'doc' ? parts.join('\n\n') : parts.join('');
}

/** 用于校验节点深度、类型集合、字段形态与 blockId 唯一性。 */
function passesNodeRules(
  node: unknown,
  depth: number,
  rules: DocumentContentRules,
  seenBlockIds: Set<string>,
): node is Record<string, unknown> {
  if (depth > rules.maxDepth || !isPlainObject(node) || typeof node.type !== 'string') {
    return false;
  }
  if (!rules.nodeTypes.has(node.type) || !isValidNodeShape(node, rules)) {
    return false;
  }
  return !rules.blockTypes.has(node.type) || hasUniqueBlockId(node, rules, seenBlockIds);
}

/**
 * 递归校验单个节点结构并返回其派生纯文本；任何规则失败返回 undefined。
 * doc 直接子块之间以空行分隔，块内 hardBreak 折叠为换行。
 */
function collectPlainText(
  node: unknown,
  depth: number,
  rules: DocumentContentRules,
  seenBlockIds: Set<string>,
): string | undefined {
  if (!passesNodeRules(node, depth, rules, seenBlockIds)) {
    return undefined;
  }
  if (node.type === 'text' || node.type === 'hardBreak') {
    return leafNodeText(node);
  }
  if (node.content === undefined) {
    return '';
  }
  if (!Array.isArray(node.content)) {
    return undefined;
  }
  return collectChildText(node, depth, rules, seenBlockIds);
}

/** 用于按共享规则校验整篇正文并在通过时返回可信 JSON 与纯文本，否则返回 undefined。 */
export function validateDocumentContent(
  value: unknown,
  rules: DocumentContentRules,
): ValidatedDocumentContent | undefined {
  if (!isPlainObject(value) || value.type !== 'doc') {
    return undefined;
  }
  if (value.content !== undefined && !Array.isArray(value.content)) {
    return undefined;
  }
  const plainText = collectPlainText(value, 0, rules, new Set<string>());
  if (plainText === undefined) {
    return undefined;
  }
  return { contentJson: value as unknown as JsonValue, plainText };
}
