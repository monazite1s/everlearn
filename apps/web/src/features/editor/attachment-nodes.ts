/** @fileoverview 定义引用附件对象的图片与通用附件 Tiptap 块节点。 */

import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';

import { ATTACHMENT_FILE_NAME_MAX_LENGTH } from '@everlearn/contracts';

import { attachmentDownloadHref, AttachmentNodeView } from './attachment-node-views';

/** 节点扩展的可选宿主回调：按 blockId 重试一次失败上传。 */
export interface AttachmentNodeOptions {
  onRetry: ((blockId: string) => void) | null;
}

/** 用于把未知形态的节点属性收窄为字符串或空。 */
export function attrString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** 用于把节点属性收敛为 NodeView 渲染所需 props。 */
function toNodeViewProps(
  props: NodeViewProps,
  kind: 'attachment' | 'image',
  onRetry: ((blockId: string) => void) | null,
) {
  const attrs = props.node.attrs as Record<string, unknown>;
  return {
    attachmentId: attrString(attrs.attachmentId),
    failed: attrs.failed === true,
    kind,
    label: attrString(attrs.alt) ?? attrString(attrs.fileName),
    onRemove: /** 用于删除失败占位节点。 */ () => props.deleteNode(),
    onRetry: /** 用于触发宿主持有的原文件重传。 */ () => {
      const blockId = attrString(attrs.blockId);
      if (blockId) onRetry?.(blockId);
    },
    uploading: attrs.uploading === true,
  };
}

/** 用于生成共享的附件块属性集，长度上限与服务端校验对齐。 */
function attachmentAttributes() {
  return {
    alt: { default: null },
    attachmentId: { default: null },
    failed: { default: false },
    fileName: { default: null },
    uploading: { default: false },
  };
}

/** 引用图片附件的块级叶子节点，alt 上限对齐服务端校验。 */
export const EverlearnImage = Node.create<AttachmentNodeOptions>({
  name: 'image',

  /** 用于提供附件重试回调注入点。 */
  addOptions() {
    return { onRetry: null };
  },

  group: 'block',
  atom: true,

  /** 用于声明共享附件属性集。 */
  addAttributes() {
    return attachmentAttributes();
  },

  /** 用于从只读 HTML 还原图片附件节点。 */
  parseHTML() {
    return [{ tag: 'img[data-attachment-id]' }];
  },

  /** 用于输出带授权下载地址的只读 img。 */
  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as Record<string, unknown>;
    const attachmentId = attrString(attrs.attachmentId);
    return [
      'img',
      mergeAttributes(HTMLAttributes, {
        alt: attrString(attrs.alt) ?? '',
        'data-attachment-id': attachmentId ?? '',
        ...(attachmentId ? { src: attachmentDownloadHref(attachmentId) } : {}),
      }),
    ];
  },

  /** 用于挂载图片三态 React 视图。 */
  addNodeView() {
    const onRetry = this.options.onRetry;
    return ReactNodeViewRenderer(
      /** 用于按节点属性渲染图片视图。 */ (props: NodeViewProps) =>
        AttachmentNodeView(toNodeViewProps(props, 'image', onRetry)),
    );
  },
});

/** 引用通用附件的块级叶子节点，fileName 上限对齐服务端校验。 */
export const EverlearnAttachment = Node.create<AttachmentNodeOptions>({
  name: 'attachment',

  /** 用于提供附件重试回调注入点。 */
  addOptions() {
    return { onRetry: null };
  },

  group: 'block',
  atom: true,

  /** 用于声明共享附件属性集。 */
  addAttributes() {
    return attachmentAttributes();
  },

  /** 用于从只读 HTML 还原通用附件节点。 */
  parseHTML() {
    return [{ tag: 'div[data-attachment-id]' }];
  },

  /** 用于输出带下载链接的只读附件行。 */
  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as Record<string, unknown>;
    const attachmentId = attrString(attrs.attachmentId);
    const fileName =
      attrString(attrs.fileName)?.slice(0, ATTACHMENT_FILE_NAME_MAX_LENGTH) ?? '附件';
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-attachment-id': attachmentId ?? '' }),
      [
        'a',
        { download: fileName, href: attachmentId ? attachmentDownloadHref(attachmentId) : '#' },
        fileName,
      ],
    ];
  },

  /** 用于挂载附件三态 React 视图。 */
  addNodeView() {
    const onRetry = this.options.onRetry;
    return ReactNodeViewRenderer(
      /** 用于按节点属性渲染附件视图。 */ (props: NodeViewProps) =>
        AttachmentNodeView(toNodeViewProps(props, 'attachment', onRetry)),
    );
  },
});
