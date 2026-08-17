/** @fileoverview 编辑会话：组合保存、修订触发、附件上传并渲染中央列与侧栏。 */

'use client';

import { useEffect, useRef, useState } from 'react';
import type { Editor, JSONContent } from '@tiptap/core';
import { PanelRightIcon } from 'lucide-react';

import { DOCUMENT_TITLE_MAX_LENGTH, type DocumentContentDetail } from '@everlearn/contracts';
import { Button } from '@everlearn/ui';

import { OfflineNotice } from '../../shared/offline-notice';
import { parseDocumentJson } from './parse-document-json';
import { TitleBar } from './editor-title-bar';
import { AttachmentConfirmDialog } from './attachment-confirm-dialog';
import { EditorPanelSheet, EditorPanelTabs } from './editor-side-panel';
import { EditorToolbar } from './editor-toolbar';
import { getDocumentContent } from './editor-api';
import { RichTextEditor } from './rich-text-editor';
import { ConflictAlert } from './save-status';
import { omitPendingAttachments, useDocumentAttachments } from './use-document-attachments';
import { useAttachmentUpload } from './use-attachment-upload';
import { useDebouncedSave } from './use-debounced-save';
import { useRevisionTriggers } from './use-revision-triggers';

/** DocumentEditorSession 的 props 契约。 */
export interface DocumentEditorSessionProps {
  /** 重挂替换后的会话，挂载时把焦点交还标题输入。 */
  readonly autoFocusTitle?: boolean;
  readonly detail: DocumentContentDetail;
  readonly knowledgeBaseId: string;
  readonly offline: boolean;
  /** 以新内容整体替换会话，由宿主递增 key 重挂。 */
  readonly onReplace: (detail: DocumentContentDetail) => void;
  readonly wide: boolean;
}

/** 冲突期间服务端最新投影的拉取状态。 */
interface ConflictInfo {
  readonly detail?: DocumentContentDetail;
  readonly status: 'loading' | 'loaded' | 'failed';
}

/** 会话控制器引用集合，供各子组件按需消费。 */
export interface SessionRuntime {
  readonly attachments: ReturnType<typeof useDocumentAttachments>;
  readonly conflictInfo: ConflictInfo | undefined;
  readonly contentJson: unknown;
  readonly editor: Editor | null;
  readonly offline: boolean;
  readonly reloadFailed: boolean;
  readonly save: ReturnType<typeof useDebouncedSave>;
  readonly title: string;
  readonly triggers: ReturnType<typeof useRevisionTriggers>;
  readonly commitTitle: (next: string) => void;
  readonly copyLocal: () => Promise<boolean>;
  readonly handleEditorReady: (instance: Editor) => void;
  readonly handleEditorUpdate: (instance: Editor) => void;
  readonly reload: () => Promise<void>;
}

/** 用于在冲突期间读取一次服务端最新版本时间。 */
function useConflictDetail(documentId: string, active: boolean): ConflictInfo | undefined {
  const [info, setInfo] = useState<ConflictInfo | undefined>();
  const startedRef = useRef(false);
  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;
    setInfo({ status: 'loading' });
    void getDocumentContent(documentId).then((result) => {
      setInfo(result.ok ? { detail: result.data, status: 'loaded' } : { status: 'failed' });
    });
  }, [active, documentId]);
  return info;
}

/** 用于把标题与正文提交给保存与修订触发器，提交前剔除上传占位。 */
function stageSnapshot(
  json: unknown,
  title: string,
  save: { stage(content: { contentJson: unknown; title?: string }): void; status: string },
  triggers: { stage(content: { contentJson: unknown; title?: string }): void },
): void {
  const contentJson = omitPendingAttachments(json as JSONContent);
  save.stage({ contentJson, title });
  // 冲突后本地内容已被用户放弃，不再为它聚合修订快照。
  if (save.status === 'conflict') return;
  triggers.stage({ contentJson, title });
}

/** 用于把本地未落库内容复制到剪贴板并返回成败。 */
async function copyLocalToClipboard(save: { copyLocalContent(): string }): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(save.copyLocalContent());
    return true;
  } catch {
    return false;
  }
}

/** 用于丢弃本地保存与修订快照后以服务端内容整体替换会话。 */
function replaceSession(
  save: { discard(): void },
  triggers: { reset(): void },
  onReplace: (detail: DocumentContentDetail) => void,
  detail: DocumentContentDetail,
): void {
  save.discard();
  triggers.reset();
  onReplace(detail);
}

/** 用于重读服务端内容并经替换回调重建会话。 */
async function reloadSession(
  documentId: string,
  replace: (detail: DocumentContentDetail) => void,
  onReloadFailed: (failed: boolean) => void,
): Promise<void> {
  const result = await getDocumentContent(documentId);
  if (result.ok) {
    onReloadFailed(false);
    replace(result.data);
    return;
  }
  onReloadFailed(true);
}

/** 会话处理器组装所需的状态与依赖。 */
interface SessionHandlerInputs {
  readonly contentJson: unknown;
  readonly editorRef: { current: Editor | null };
  readonly save: ReturnType<typeof useDebouncedSave>;
  readonly setContentJson: (json: unknown) => void;
  readonly setEditor: (editor: Editor | null) => void;
  readonly setTitle: (title: string) => void;
  readonly title: string;
  readonly triggers: ReturnType<typeof useRevisionTriggers>;
}

/** 用于构造标题与正文的事件处理器。 */
function buildSessionHandlers(inputs: SessionHandlerInputs) {
  const { contentJson, editorRef, save, setContentJson, setEditor, setTitle, title, triggers } =
    inputs;
  return {
    commitTitle: /** 用于提交标题变更并保留当前正文。 */ (next: string) => {
      const value = next.slice(0, DOCUMENT_TITLE_MAX_LENGTH);
      setTitle(value);
      stageSnapshot(editorRef.current?.getJSON() ?? contentJson, value, save, triggers);
    },
    handleEditorReady: /** 用于登记编辑器实例并同步初始正文。 */ (instance: Editor) => {
      editorRef.current = instance;
      setEditor(instance);
      setContentJson(instance.getJSON());
    },
    handleEditorUpdate: /** 用于在编辑器事务后同步本地正文快照。 */ (instance: Editor) => {
      const json = instance.getJSON();
      stageSnapshot(json, title, save, triggers);
      setContentJson(json);
    },
  };
}

/** 用于组装保存、修订触发与附件三组会话控制器。 */
function useSessionControllers(
  detail: DocumentContentDetail,
  offline: boolean,
  editorRef: { current: Editor | null },
) {
  const save = useDebouncedSave({ documentId: detail.id, initialVersion: detail.version });
  const triggers = useRevisionTriggers({
    documentId: detail.id,
    initialVersion: detail.version,
  });
  const attachments = useDocumentAttachments({
    disabled: offline || save.status === 'conflict',
    editorRef,
    upload: useAttachmentUpload(),
  });
  // 冲突进入即丢弃已聚合的修订快照，避免间隔与卸载为被放弃的内容留档。
  useEffect(() => {
    if (save.status === 'conflict') triggers.reset();
  }, [save.status, triggers]);
  return {
    attachments,
    conflictInfo: useConflictDetail(detail.id, save.status === 'conflict'),
    save,
    triggers,
  };
}

/** 用于组装会话控制器与本地状态。 */
function useSessionRuntime(
  detail: DocumentContentDetail,
  offline: boolean,
  onReplace: (detail: DocumentContentDetail) => void,
): SessionRuntime {
  const [title, setTitle] = useState(detail.title);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [contentJson, setContentJson] = useState<unknown>(detail.contentJson);
  const [reloadFailed, setReloadFailed] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const { attachments, conflictInfo, save, triggers } = useSessionControllers(
    detail,
    offline,
    editorRef,
  );
  // eslint-disable-next-line react-hooks/refs -- 渲染期仅传递 ref 对象，current 读取只发生在事件回调
  const handlers = buildSessionHandlers({
    contentJson,
    editorRef,
    save,
    setContentJson,
    setEditor,
    setTitle,
    title,
    triggers,
  });

  return {
    attachments,
    commitTitle: handlers.commitTitle,
    conflictInfo,
    contentJson,
    copyLocal: /** 用于复制本地未落库内容。 */ () => copyLocalToClipboard(save),
    editor,
    handleEditorReady: handlers.handleEditorReady,
    handleEditorUpdate: handlers.handleEditorUpdate,
    offline,
    reload: /** 用于重载服务端内容并替换会话。 */ () =>
      reloadSession(
        detail.id,
        /** 用于重载成功后丢弃本地快照并替换会话。 */ (next) =>
          replaceSession(save, triggers, onReplace, next),
        setReloadFailed,
      ),
    reloadFailed,
    save,
    title,
    triggers,
  };
}

/** 用于渲染 sticky 工具栏行与中等宽度的面板入口。 */
function ToolbarBar(props: {
  readonly onOpenPanel: () => void;
  readonly runtime: SessionRuntime;
  readonly wide: boolean;
}) {
  const readonly = props.runtime.offline || props.runtime.save.status === 'conflict';
  return (
    <div className="sticky top-(--header-height) z-20 border-b bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-prose items-center justify-between px-6">
        <EditorToolbar disabled={readonly} editor={props.runtime.editor} />
        {!props.wide && (
          <Button
            aria-label="打开文档面板"
            onClick={props.onOpenPanel}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <PanelRightIcon aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}

/** 用于渲染正文编辑器、冲突提示与重载反馈。 */
function EditorBody(props: {
  readonly detail: DocumentContentDetail;
  readonly runtime: SessionRuntime;
}) {
  const { runtime } = props;
  const readonly = runtime.offline || runtime.save.status === 'conflict';
  return (
    <div className="mx-auto w-full max-w-prose px-6 pt-4 pb-16">
      <RichTextEditor
        attachmentRetry={runtime.attachments.retryUpload}
        editable={!readonly}
        extraSlashItems={runtime.attachments.slashItems}
        initialContent={parseDocumentJson(props.detail.contentJson)}
        onCreate={runtime.handleEditorReady}
        onFilesReceived={runtime.attachments.receiveFiles}
        onUpdate={runtime.handleEditorUpdate}
      />
      {runtime.save.status === 'conflict' && (
        <ConflictAlert
          onCopyLocal={runtime.copyLocal}
          onReload={() => void runtime.reload()}
          serverUpdatedAt={runtime.conflictInfo?.detail?.updatedAt}
        />
      )}
      {runtime.reloadFailed && (
        <p className="mt-2 mb-0 text-sm text-destructive" role="alert">
          重载失败，请重试。
        </p>
      )}
    </div>
  );
}

/* eslint-disable react-hooks/refs -- 渲染期向隐藏 input 绑定回调 ref 与 picker 属性快照，读取不在渲染路径 */
/** 用于挂载隐藏文件选择与确认对话框。 */
function AttachmentControls(props: { readonly runtime: SessionRuntime }) {
  const { attachments } = props.runtime;
  const pending = attachments.pending;
  return (
    <>
      <input
        accept={attachments.picker.accept}
        hidden
        onChange={attachments.picker.onChange}
        ref={attachments.registerPicker}
        type="file"
      />
      {pending && (
        <AttachmentConfirmDialog
          file={pending.file}
          kind={pending.kind}
          onCancel={attachments.cancelPending}
          onConfirm={attachments.confirmPending}
        />
      )}
    </>
  );
}
// eslint-enable react-hooks/refs -- 恢复渲染期引用检查

/** 用于承载一次编辑会话并组合各子组件。 */
export function DocumentEditorSession(props: DocumentEditorSessionProps) {
  const { autoFocusTitle, detail, knowledgeBaseId, offline, onReplace, wide } = props;
  const runtime = useSessionRuntime(detail, offline, onReplace);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelProps = {
    contentDetail: detail,
    contentJson: runtime.contentJson,
    documentId: detail.id,
    getVersion: /** 用于读取当前保存基线版本。 */ () => runtime.save.getVersion(),
    onRestored: /** 用于恢复成功后丢弃本地快照并整体替换会话。 */ (next: DocumentContentDetail) =>
      replaceSession(runtime.save, runtime.triggers, onReplace, next),
  };
  return (
    <>
      <section aria-label="文档编辑区" className="flex min-w-0 flex-col">
        <TitleBar autoFocus={autoFocusTitle} knowledgeBaseId={knowledgeBaseId} runtime={runtime} />
        {offline && (
          <OfflineNotice
            className="mx-6 mt-2"
            description="当前离线：正文转为只读，编辑与上传暂不可用。"
          />
        )}
        <ToolbarBar onOpenPanel={() => setPanelOpen(true)} runtime={runtime} wide={wide} />
        <EditorBody detail={detail} runtime={runtime} />
        <AttachmentControls runtime={runtime} />
      </section>
      {wide ? (
        <aside aria-label="文档面板" className="min-w-0 border-l border-border px-4 py-4">
          <EditorPanelTabs {...panelProps} />
        </aside>
      ) : (
        <EditorPanelSheet onOpenChange={setPanelOpen} open={panelOpen} {...panelProps} />
      )}
    </>
  );
}
