/** @fileoverview 定义正文 schemaVersion 1 的批准节点、标记集合与 Tiptap 扩展配置。 */

import type { Extensions, JSONContent } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';

import { BlockId } from './block-id';

/** 当前已发布的正文 Schema 版本，与 Document.schemaVersion 对齐。 */
export const EDITOR_SCHEMA_VERSION = 1;

/** 携带 blockId 的可引用块级节点类型（按类型生效，含嵌套实例）。 */
export const BLOCK_NODE_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'bulletList',
  'orderedList',
  'codeBlock',
  'horizontalRule',
] as const;

/** schemaVersion 1 允许的标题层级。 */
export const APPROVED_HEADING_LEVELS = [1, 2, 3, 4] as const;

/** schemaVersion 1 允许出现的全部节点类型。 */
export const APPROVED_NODE_TYPES: ReadonlySet<string> = new Set([
  'doc',
  ...BLOCK_NODE_TYPES,
  'listItem',
  'text',
  'hardBreak',
]);

/** schemaVersion 1 允许出现的全部标记类型，随 StarterKit v3 默认集。 */
export const APPROVED_MARK_TYPES: ReadonlySet<string> = new Set([
  'bold',
  'italic',
  'strike',
  'code',
  'underline',
  'link',
]);

/** 正文 JSON 的根文档结构，供序列化与解析共享。 */
export type EditorDocumentJson = JSONContent;

/** 用于构建 schemaVersion 1 的纯扩展配置，不含任何运行时状态。 */
export function createEditorSchema(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [...APPROVED_HEADING_LEVELS] },
      // ponytail: trailing 补段节点由插件异步追加，绕过 blockId 初始化修复；ED-05 需要时再启用并补齐修复链路。
      trailingNode: false,
    }),
    BlockId.configure({ types: [...BLOCK_NODE_TYPES] }),
  ];
}
