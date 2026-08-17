/** @fileoverview 组装 schemaVersion 1 的 Tiptap 扩展配置，批准集合来自共享契约。 */

import type { Extensions, JSONContent } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { DOCUMENT_APPROVED_HEADING_LEVELS, DOCUMENT_BLOCK_NODE_TYPES } from '@everlearn/contracts';

import { BlockId } from './block-id';

/** 正文 JSON 的根文档结构，供序列化与解析共享。 */
export type EditorDocumentJson = JSONContent;

/** 用于构建 schemaVersion 1 的纯扩展配置，不含任何运行时状态。 */
export function createEditorSchema(): Extensions {
  return [
    StarterKit.configure({
      heading: { levels: [...DOCUMENT_APPROVED_HEADING_LEVELS] },
      // ponytail: trailing 补段节点由插件异步追加，绕过 blockId 初始化修复；ED-05 需要时再启用并补齐修复链路。
      trailingNode: false,
    }),
    BlockId.configure({ types: [...DOCUMENT_BLOCK_NODE_TYPES] }),
  ];
}
