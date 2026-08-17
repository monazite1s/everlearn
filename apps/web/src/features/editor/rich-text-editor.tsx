/** @fileoverview 挂载 schemaVersion 1 富文本编辑器与 Slash Menu 的最小组件。 */

'use client';

import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';

import type { EditorDocumentJson } from './editor-schema';
import { createEditorSchema } from './editor-schema';
import { createSlashMenuExtension, SlashMenuPopup, useSlashMenuSession } from './slash-menu';

/** RichTextEditor 的 props 契约。 */
export interface RichTextEditorProps {
  initialContent?: EditorDocumentJson | undefined;
  onCreate?: ((editor: Editor) => void) | undefined;
}

/** 提供编辑器挂载、可见焦点态与 Slash Menu 的最小实现，工具栏由后续任务接入。 */
export function RichTextEditor({ initialContent, onCreate }: RichTextEditorProps) {
  const { handlers, menu, registerPopupApi, runCommand } = useSlashMenuSession();
  const onCreateRef = useRef(onCreate);

  useEffect(() => {
    onCreateRef.current = onCreate;
  }, [onCreate]);

  const editor = useEditor(
    useMemo(
      /** 用于组装 schemaVersion 1 编辑器选项，依赖保持稳定以避免重建实例。 */
      () => {
        return {
          // ponytail: 最小正文 content 为空时回退默认段落，避免空 doc 违反 block+ 内容式。
          ...(initialContent?.content?.length ? { content: initialContent } : {}),
          editorProps: {
            attributes: {
              'aria-label': '文档正文',
              'aria-multiline': 'true',
              class: 'min-h-40 px-4 py-3 text-foreground outline-none',
              role: 'textbox',
            },
          },
          enableContentCheck: true,
          extensions: [...createEditorSchema(), createSlashMenuExtension(handlers)],
          immediatelyRender: false,
          onCreate: /** 用于把实例交给宿主回调。 */ ({ editor: created }: { editor: Editor }) =>
            onCreateRef.current?.(created),
        };
      },
      [handlers, initialContent],
    ),
  );

  return (
    <div className="rounded-lg border border-input bg-background transition-[color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50">
      <EditorContent editor={editor} />
      {menu &&
        createPortal(
          <SlashMenuPopup items={menu.items} registerApi={registerPopupApi} run={runCommand} />,
          menu.container,
        )}
    </div>
  );
}
