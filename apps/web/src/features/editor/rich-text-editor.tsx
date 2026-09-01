/** @fileoverview 挂载 schemaVersion 1 富文本编辑器与 Slash Menu 的最小组件。 */

'use client';

import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';

import { createEditorSchema, type EditorDocumentJson } from './editor-schema';
import { SlashMenuPopup } from './slash-menu-popup';
import {
  createSlashMenuExtension,
  useSlashMenuSession,
  type SlashMenuHandlers,
  type SlashMenuItem,
  type SlashMenuPopupApi,
  type SlashMenuSessionState,
} from './slash-menu';

/** RichTextEditor 的 props 契约。 */
export interface RichTextEditorProps {
  /** 失败附件占位按 blockId 重试的宿主入口。 */
  attachmentRetry?: ((blockId: string) => void) | undefined;
  initialContent?: EditorDocumentJson | undefined;
  onCreate?: ((editor: Editor) => void) | undefined;
  /** 只读切换；false 时编辑器转为不可编辑但保持内容与选择。 */
  editable?: boolean;
  /** 宿主注入的斜杠菜单额外项。 */
  extraSlashItems?: readonly SlashMenuItem[] | undefined;
  /** 粘贴或拖入文件时转交宿主处理，返回 true 表示已消费。 */
  onFilesReceived?: ((files: File[]) => boolean) | undefined;
  onUpdate?: ((editor: Editor) => void) | undefined;
}

/** 宿主回调的可变引用集合，编辑器选项依赖其稳定身份。 */
interface HostCallbackRefs {
  readonly attachmentRetry: { current: ((blockId: string) => void) | undefined };
  readonly filesReceived: { current: ((files: File[]) => boolean) | undefined };
}

/** 用于提取剪贴板粘贴事件中的真实文件列表。 */
function pastedFiles(event: ClipboardEvent): File[] {
  return event.clipboardData?.files ? Array.from(event.clipboardData.files) : [];
}

/** 用于提取拖放事件中的真实文件列表。 */
function droppedFiles(event: DragEvent): File[] {
  return event.dataTransfer?.files ? Array.from(event.dataTransfer.files) : [];
}

/** 用于在事件回调内转发文件给宿主并返回是否已消费。 */
function forwardFiles(refs: { current: HostCallbackRefs }, files: File[]): boolean {
  return refs.current.filesReceived.current?.(files) ?? false;
}

/** 用于在事件回调内转发附件占位重试。 */
function forwardAttachmentRetry(refs: { current: HostCallbackRefs }, blockId: string): void {
  refs.current.attachmentRetry.current?.(blockId);
}

/** 编辑器选项组装所需的稳定引用集合。 */
interface EditorOptionsInputs {
  readonly handlers: SlashMenuHandlers;
  readonly hostRefs: { current: HostCallbackRefs };
  readonly initialContent: EditorDocumentJson | undefined;
  readonly onCreateRef: { current: ((editor: Editor) => void) | undefined };
  readonly onUpdateRef: { current: ((editor: Editor) => void) | undefined };
}

/** 用于组装 schemaVersion 1 编辑器选项，依赖保持稳定以避免重建实例。 */
function buildEditorOptions(inputs: EditorOptionsInputs) {
  const { handlers, hostRefs, initialContent, onCreateRef, onUpdateRef } = inputs;
  // 创建期 blockId 规范化事务早于 onCreate 触发 onUpdate，初始化修复不得标记会话脏。
  let created = false;
  return {
    // ponytail: 最小正文 content 为空时回退默认段落，避免空 doc 违反 block+ 内容式。
    ...(initialContent?.content?.length ? { content: initialContent } : {}),
    editorProps: {
      attributes: {
        'aria-label': '文档正文',
        'aria-multiline': 'true',
        class: 'editor-content min-h-40 px-4 py-3 text-foreground outline-none',
        role: 'textbox',
      },
      handleDOMEventPaste: /** 用于把文件粘贴转交宿主上传流程。 */ (
        _view: unknown,
        event: ClipboardEvent,
      ) => (pastedFiles(event).length > 0 ? forwardFiles(hostRefs, pastedFiles(event)) : false),
      handleDrop: /** 用于把文件拖入转交宿主上传流程。 */ (_view: unknown, event: DragEvent) =>
        droppedFiles(event).length > 0 ? forwardFiles(hostRefs, droppedFiles(event)) : false,
    },
    enableContentCheck: true,
    extensions: [
      ...createEditorSchema({
        attachmentRetry: /** 用于转发失败占位重试且保持扩展实例稳定。 */ (blockId) =>
          forwardAttachmentRetry(hostRefs, blockId),
      }),
      createSlashMenuExtension(handlers),
    ],
    immediatelyRender: false,
    onCreate: /** 用于把实例交给宿主回调。 */ ({ editor }: { editor: Editor }) => {
      created = true;
      onCreateRef.current?.(editor);
    },
    onUpdate: /** 用于把内容变更交给宿主保存流程。 */ ({ editor }: { editor: Editor }) => {
      if (!created) return;
      onUpdateRef.current?.(editor);
    },
  };
}

/** 宿主回调引用同步 hook 的输入。 */
interface HostCallbackInputs {
  readonly attachmentRetry: ((blockId: string) => void) | undefined;
  readonly onFilesReceived: ((files: File[]) => boolean) | undefined;
  readonly onCreate: ((editor: Editor) => void) | undefined;
  readonly onUpdate: ((editor: Editor) => void) | undefined;
}

/** 用于把宿主回调收敛为稳定 ref 并在变化后同步。 */
function useHostCallbackRefs(inputs: HostCallbackInputs) {
  const onCreateRef = useRef(inputs.onCreate);
  const onUpdateRef = useRef(inputs.onUpdate);
  const hostRefs = useRef<HostCallbackRefs>({
    attachmentRetry: { current: undefined },
    filesReceived: { current: undefined },
  });

  useEffect(() => {
    onCreateRef.current = inputs.onCreate;
    onUpdateRef.current = inputs.onUpdate;
    hostRefs.current.attachmentRetry.current = inputs.attachmentRetry;
    hostRefs.current.filesReceived.current = inputs.onFilesReceived;
  }, [inputs, onCreateRef, onUpdateRef, hostRefs]);

  return { hostRefs, onCreateRef, onUpdateRef };
}

/** 提供编辑器挂载、可见焦点态与 Slash Menu 的最小实现，工具栏由宿主接入。 */
export function RichTextEditor(props: RichTextEditorProps) {
  const {
    attachmentRetry,
    initialContent,
    onCreate,
    editable = true,
    onFilesReceived,
    onUpdate,
  } = props;
  const session = useSlashMenuSession({ extraItems: props.extraSlashItems });
  const refs = useHostCallbackRefs({ attachmentRetry, onFilesReceived, onCreate, onUpdate });
  const onCreateRef = refs.onCreateRef;
  const onUpdateRef = refs.onUpdateRef;
  const hostRefs = refs.hostRefs;

  const options = useMemo(
    /** 用于一次性组装编辑器选项。 */ () =>
      buildEditorOptions({
        handlers: session.handlers,
        hostRefs,
        initialContent,
        onCreateRef,
        onUpdateRef,
      }),
    [session.handlers, initialContent, hostRefs, onCreateRef, onUpdateRef],
  );
  const editor = useEditor(options);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
    editor.view.dom.setAttribute('aria-readonly', String(!editable));
  }, [editor, editable]);

  return (
    <EditorShell
      editor={editor}
      menu={session.menu}
      registerPopupApi={session.registerPopupApi}
      run={session.runCommand}
    />
  );
}

/** 编辑器外壳渲染所需的会话成员。 */
interface EditorShellProps {
  readonly editor: Editor | null;
  readonly menu: SlashMenuSessionState | null;
  readonly registerPopupApi: (api: SlashMenuPopupApi | null) => void;
  readonly run: (value: string) => void;
}

/** 用于渲染编辑器容器与斜杠菜单弹层。 */
function EditorShell(props: EditorShellProps) {
  return (
    <div className="rounded-lg border border-input bg-background transition-[color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50">
      <EditorContent editor={props.editor} />
      {props.menu &&
        createPortal(
          <SlashMenuPopup
            items={props.menu.items}
            registerApi={props.registerPopupApi}
            run={props.run}
          />,
          props.menu.container,
        )}
    </div>
  );
}
