/** @fileoverview 为批准的块级节点维护文档内唯一的稳定 blockId 属性。 */

import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';

/** blockId 的合法格式为标准 UUID（任意版本，兼容服务端生成策略）。 */
const BLOCK_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 用于识别本扩展追加的事务，避免重复处理。 */
const BLOCK_ID_PLUGIN_KEY = new PluginKey('everlearnBlockId');

const BLOCK_ID_META = 'everlearn:blockId';

/** 描述一处需要补齐或重分配的块 ID 修复。 */
interface BlockIdFix {
  pos: number;
  id: string;
}

/** 用于在信任边界判断 blockId 是否为合法 UUID。 */
export function isBlockId(value: unknown): value is string {
  return typeof value === 'string' && BLOCK_ID_PATTERN.test(value);
}

/** 用于生成新的块 ID，浏览器与 Node 均提供 crypto.randomUUID。 */
function createBlockId(): string {
  return crypto.randomUUID();
}

/** 用于按文档顺序规划 ID 修复：缺失、非法或重复的 blockId 都重新分配。 */
function planBlockIdFixes(doc: ProseMirrorNode, types: readonly string[]): BlockIdFix[] {
  const fixes: BlockIdFix[] = [];
  const seen = new Set<string>();
  doc.descendants((node: ProseMirrorNode, pos: number) => {
    if (!types.includes(node.type.name)) {
      return;
    }
    const id: unknown = node.attrs.blockId;
    if (isBlockId(id) && !seen.has(id)) {
      seen.add(id);
      return;
    }
    fixes.push({ id: createBlockId(), pos });
  });
  return fixes;
}

/** 用于把修复计划写回文档；属性变更不改变节点尺寸，位置保持有效。 */
function applyBlockIdFixes(base: Transaction, fixes: BlockIdFix[]): Transaction {
  for (const fix of fixes) {
    const node = base.doc.nodeAt(fix.pos);
    if (!node) {
      continue;
    }
    base.setNodeMarkup(fix.pos, undefined, { ...node.attrs, blockId: fix.id });
  }
  return base;
}

/** 用于对当前文档规划并应用一次 ID 修复，无修复时返回 undefined。 */
function normalizeBlockIds(tr: Transaction, types: readonly string[]): Transaction | undefined {
  const fixes = planBlockIdFixes(tr.doc, types);
  if (fixes.length === 0) {
    return undefined;
  }
  return applyBlockIdFixes(tr.setMeta(BLOCK_ID_META, true), fixes);
}

/**
 * @designPattern ProseMirror Plugin（官方插件协议）
 * 通过 appendTransaction 钩子维护文档级不变量；解决编辑操作（拆分、粘贴、导入）
 * 破坏 blockId 唯一性的问题，移除条件为编辑器停止使用 blockId 锚点。
 */
export const BlockId = Extension.create<{ types: string[] }>({
  name: 'blockId',

  /** 提供默认的 blockId 目标类型集合，由 createEditorSchema 注入。 */
  addOptions() {
    return { types: [] };
  },

  /** 为目标块类型挂载 blockId 全局属性并同步 HTML data 属性。 */
  addGlobalAttributes() {
    return [
      {
        attributes: {
          blockId: {
            default: null,
            parseHTML: /** 用于从 HTML 还原块 ID。 */ (element) =>
              element.getAttribute('data-block-id'),
            renderHTML: /** 用于把块 ID 输出为 HTML data 属性。 */ (attributes) =>
              isBlockId(attributes.blockId) ? { 'data-block-id': attributes.blockId } : {},
          },
        },
        types: this.options.types,
      },
    ];
  },

  /** 初始内容不经过 dispatch，导入缺失 ID 时在此补齐。 */
  onCreate() {
    // ponytail: 初始化走全量遍历，天花板为超大文档 O(n)。
    const fix = normalizeBlockIds(this.editor.state.tr, this.options.types);
    if (fix) {
      this.editor.view.dispatch(fix);
    }
  },

  /** 注册维护唯一性的 ProseMirror 插件。 */
  addProseMirrorPlugins() {
    const types = this.options.types;
    return [
      new Plugin({
        appendTransaction: /** 文档变更后补齐或重分配非法与重复的块 ID。 */ (
          transactions,
          _oldState,
          newState,
        ) => {
          if (!transactions.some((tr) => tr.docChanged && !tr.getMeta(BLOCK_ID_META))) {
            return undefined;
          }
          return normalizeBlockIds(newState.tr, types);
        },
        key: BLOCK_ID_PLUGIN_KEY,
      }),
    ];
  },
});
