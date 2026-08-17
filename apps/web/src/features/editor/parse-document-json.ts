/** @fileoverview 在信任边界收窄来自服务端的正文 JSON，仅做结构第一层校验。 */

import {
  DOCUMENT_APPROVED_HEADING_LEVELS,
  DOCUMENT_APPROVED_MARK_TYPES,
  DOCUMENT_APPROVED_NODE_TYPES,
  DOCUMENT_JSON_MAX_DEPTH,
} from '@everlearn/contracts';

import { isBlockId } from './block-id';
import type { EditorDocumentJson } from './editor-schema';

const HEADING_LEVELS = new Set<number>(DOCUMENT_APPROVED_HEADING_LEVELS);

/** 用于区分普通对象与数组、null 等伪对象。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 用于校验 marks 字段：批准标记名或带合法 type/attrs 的标记对象。 */
function isValidMarks(value: unknown): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every((mark) => {
    if (typeof mark === 'string') {
      return DOCUMENT_APPROVED_MARK_TYPES.has(mark);
    }
    if (!isPlainObject(mark) || typeof mark.type !== 'string') {
      return false;
    }
    return (
      DOCUMENT_APPROVED_MARK_TYPES.has(mark.type) &&
      (mark.attrs === undefined || isPlainObject(mark.attrs))
    );
  });
}

/** 用于校验节点的 attrs、text 与 marks 字段。 */
function isValidFields(value: Record<string, unknown>): boolean {
  if (value.attrs !== undefined && !isPlainObject(value.attrs)) {
    return false;
  }
  const attrBlockId = value.attrs?.blockId;
  if (attrBlockId !== undefined && attrBlockId !== null && !isBlockId(attrBlockId)) {
    return false;
  }
  if (value.text !== undefined && typeof value.text !== 'string') {
    return false;
  }
  return value.marks === undefined || isValidMarks(value.marks);
}

/** 用于校验 content 数组的每一项都是合法节点。 */
function isValidContent(value: unknown, depth: number): boolean {
  return Array.isArray(value) && value.every((child) => isValidNode(child, depth + 1));
}

/** 用于校验标题层级落在批准范围内，缺失时沿用 schema 默认层级。 */
function hasApprovedHeadingLevel(value: Record<string, unknown>): boolean {
  const attrs = value.attrs;
  if (!isPlainObject(attrs)) return true;
  const level = attrs.level;
  return level === undefined || (typeof level === 'number' && HEADING_LEVELS.has(level));
}

/** 用于递归校验单个节点对象的结构与已知类型。 */
function isValidNode(value: unknown, depth: number): boolean {
  // ponytail: 递归深度上限防御恶意嵌套，上限值以契约单源为准。
  if (depth > DOCUMENT_JSON_MAX_DEPTH || !isPlainObject(value) || typeof value.type !== 'string') {
    return false;
  }
  if (!DOCUMENT_APPROVED_NODE_TYPES.has(value.type)) {
    return false;
  }
  if (value.type === 'heading' && !hasApprovedHeadingLevel(value)) {
    return false;
  }
  if (!isValidFields(value)) {
    return false;
  }
  return value.content === undefined || isValidContent(value.content, depth);
}

/**
 * 解析外部正文 JSON：非 doc、未知节点、未知标记、非法 blockId 或越界标题层级一律
 * 拒绝并返回 undefined；合法时原样返回 ProseMirror 文档节点 JSON。
 */
export function parseDocumentJson(value: unknown): EditorDocumentJson | undefined {
  if (!isPlainObject(value) || value.type !== 'doc') {
    return undefined;
  }
  if (value.content !== undefined && !Array.isArray(value.content)) {
    return undefined;
  }
  return isValidNode(value, 0) ? value : undefined;
}
