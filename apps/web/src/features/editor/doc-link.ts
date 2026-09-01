/** @fileoverview 定义 docLink 内部链接标记及其 data 属性与下划线渲染。 */

import { Mark } from '@tiptap/core';

import { isBlockId } from './block-id';

/** 用于把目标文档包装为可识别的内部链接 span。 */
export const DocLink = Mark.create({
  name: 'docLink',

  // 光标移出即脱离标记，避免继续输入被误包进链接。
  inclusive: false,

  /** 用于声明目标文档 ID 属性并与 HTML data 属性互转。 */
  addAttributes() {
    return {
      documentId: {
        default: null,
        parseHTML: /** 用于从 HTML 还原目标文档 ID。 */ (element) =>
          element.getAttribute('data-document-id'),
        renderHTML: /** 用于仅在校验通过时输出目标文档 ID。 */ (attributes) =>
          isBlockId(attributes.documentId) ? { 'data-document-id': attributes.documentId } : {},
      },
    };
  },

  /** 用于从静态 HTML 识别内部链接 span。 */
  parseHTML() {
    return [{ tag: 'span[data-document-id]' }];
  },

  /** 用于渲染带下划线样式的内部链接 span。 */
  renderHTML() {
    return ['span', { class: 'doc-link' }, 0];
  },
});
