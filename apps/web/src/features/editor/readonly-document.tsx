/** @fileoverview 用 @tiptap/html 在无编辑实例的设备上静态渲染文档正文。 */

'use client';

import { useMemo } from 'react';
import { generateHTML } from '@tiptap/html';

import { Alert, AlertDescription } from '@everlearn/ui';

import './editor-content.css';
import { createEditorSchema, type EditorDocumentJson } from './editor-schema';
import { parseDocumentJson } from './parse-document-json';

/** 用于按共享 schema 把正文 JSON 渲染为可信静态 HTML。 */
function renderDocumentHtml(contentJson: unknown): string {
  // 信任边界收窄：非法结构回退空文档，不在只读设备上抛错。
  const parsed: EditorDocumentJson = parseDocumentJson(contentJson) ?? { type: 'doc', content: [] };
  return generateHTML(parsed, createEditorSchema());
}

/** ReadonlyDocument 的 props 契约。 */
export interface ReadonlyDocumentProps {
  contentJson: unknown;
  /** 是否展示移动设备阅读提示条。 */
  showReadonlyHint?: boolean;
}

/** 用于在无编辑实例的设备上静态渲染正文并提示能力边界。 */
export function ReadonlyDocument(props: ReadonlyDocumentProps) {
  const html = useMemo(() => renderDocumentHtml(props.contentJson), [props.contentJson]);
  return (
    <div className="mx-auto w-full max-w-prose px-4 md:px-6">
      {props.showReadonlyHint && (
        <Alert className="mb-4" role="status">
          <AlertDescription>当前设备支持阅读，编辑请使用桌面端。</AlertDescription>
        </Alert>
      )}
      {/* HTML 由共享 schema 与信任边界解析器生成，不含用户原始输入。 */}
      <div
        className="editor-content pb-16"
        dangerouslySetInnerHTML={{ __html: html }}
        role="region"
        aria-label="文档正文（只读）"
      />
    </div>
  );
}
