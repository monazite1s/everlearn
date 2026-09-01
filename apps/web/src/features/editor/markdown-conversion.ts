/** @fileoverview 用官方 Markdown 扩展在编辑器 schema 上互转 Markdown 与正文 JSON。 */

import { Editor } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';

import { createEditorSchema, type EditorDocumentJson } from './editor-schema';

/** 用于持有按编辑器 schema 构建的转换器，进程内复用同一无头实例。 */
let converter: NonNullable<Editor['markdown']> | null = null;

/** 用于按需创建无头编辑器并暴露解析与序列化能力。 */
function getConverter(): NonNullable<Editor['markdown']> {
  if (converter) return converter;
  const editor = new Editor({
    // 官方扩展默认把未注册的原始 HTML 降级为字面文本，不进入正文结构。
    extensions: [...createEditorSchema(), Markdown],
  });
  converter = editor.markdown ?? null;
  if (!converter) throw new Error('Markdown extension did not initialize its manager');
  return converter;
}

/** 用于把不可信 Markdown 文本解析为编辑器正文 JSON。 */
export function markdownToDocJson(markdown: string): EditorDocumentJson {
  return getConverter().parse(markdown);
}

/** 用于把编辑器正文 JSON 序列化为 Markdown 文本。 */
export function docJsonToMarkdown(contentJson: EditorDocumentJson): string {
  return getConverter().serialize(contentJson);
}

/** 用于把附件叶子节点替换为占位段落，避免导入内容引用不存在的附件。 */
function toPlaceholderParagraph(node: EditorDocumentJson): EditorDocumentJson {
  const alt = typeof node.attrs?.alt === 'string' ? node.attrs.alt.trim() : '';
  const label =
    node.type === 'image' && alt ? `图片：${alt}` : node.type === 'image' ? '图片' : '附件';
  return { content: [{ marks: [], text: `[${label}]`, type: 'text' }], type: 'paragraph' };
}

/** 用于把 Markdown 解析为可保存的正文：附件块替换为占位段落。 */
export function markdownToImportableDocJson(markdown: string): EditorDocumentJson {
  const json = markdownToDocJson(markdown);
  /** 用于递归替换节点树中的附件块。 */
  const mapNode = (node: EditorDocumentJson): EditorDocumentJson => {
    if (node.type === 'image' || node.type === 'attachment') return toPlaceholderParagraph(node);
    return { ...node, ...(node.content ? { content: node.content.map(mapNode) } : {}) };
  };
  return mapNode(json);
}
