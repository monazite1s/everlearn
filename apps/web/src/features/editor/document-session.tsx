/** @fileoverview 编辑会话：组合保存、修订触发、附件上传并渲染中央列与侧栏。 */

'use client';

import { useEffect, useRef, useState } from 'react';
import type { Editor, JSONContent } from '@tiptap/core';

import { DOCUMENT_TITLE_MAX_LENGTH, type DocumentContentDetail } from '@everlearn/contracts';

import { OfflineNotice } from '../../shared/offline-notice';
import { applyAiDraft } from './ai-panel';
import { parseDocumentJson } from './parse-document-json';
import { EditorRightRail } from './editor-right-rail';
import { useConflictDetail, type ConflictInfo } from './use-conflict-detail';
import { TitleBar } from './editor-title-bar';
import { AttachmentConfirmDialog } from './attachment-confirm-dialog';
import { EditorPanelSheet, EditorPanelTabs } from './editor-side-panel';
import { EditorToolbar } from './editor-toolbar';
import { getDocumentContent } from './editor-api';
import { RichTextEditor } from './rich-text-editor';
import { ConflictAlert } from './save-status';
import { SearchBlockTarget, type SearchBlockTargetQuery } from './search-block-target';
import { omitPendingAttachments, useDocumentAttachments } from './use-document-attachments';
import { useAttachmentUpload } from './use-attachment-upload';
import { useDebouncedSave } from './use-debounced-save';
import { useRevisionTriggers } from './use-revision-triggers';

/** DocumentEditorSession 的 props 契约。 */
export interface DocumentEditorSessionProps {
  /** 重挂替换后的会话，挂载时把焦点交还标题输入。 */
  readonly autoFocusTitle?: boolean;
  readonly detail: DocumentContentDetail;
  /** 当前知识库显示名，面包屑首项使用。 */
  readonly kbName?: string | undefined;
  readonly knowledgeBaseId: string;
  readonly offline: boolean;
  /** 以新内容整体替换会话，由宿主递增 key 重挂。 */
  readonly onReplace: (detail: DocumentContentDetail) => void;
  readonly searchTarget?: SearchBlockTargetQuery | null | undefined;
  readonly wide: boolean;
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

/** 用于渲染正文编辑器、冲突提示与重载反馈。 */
function EditorBody(props: {
  readonly detail: DocumentContentDetail;
  readonly runtime: SessionRuntime;
  readonly searchTarget?: SearchBlockTargetQuery | null | undefined;
}) {
  const { runtime } = props;
  const readonly = runtime.offline || runtime.save.status === 'conflict';
  const rootRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className="mx-auto w-full max-w-prose px-6 pt-4 pb-16" ref={rootRef}>
      <SearchBlockTarget
        currentDocumentVersion={props.detail.version}
        ready={runtime.editor !== null}
        rootRef={rootRef}
        target={props.searchTarget ?? null}
      />
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

/** 用于组合编辑区标题、状态、工具栏、正文与附件入口。 */
function EditorSessionMain(props: {
  readonly aiOpen: boolean;
  readonly autoFocusTitle?: boolean | undefined;
  readonly detail: DocumentContentDetail;
  readonly knowledgeBaseId: string;
  readonly kbName?: string | undefined;
  readonly onToggleAi: () => void;
  readonly onTogglePanel: () => void;
  readonly panelOpen: boolean;
  readonly runtime: SessionRuntime;
  readonly searchTarget?: SearchBlockTargetQuery | null | undefined;
}) {
  return (
    <section aria-label="文档编辑区" className="flex min-w-0 flex-col">
      <TitleBar
        aiOpen={props.aiOpen}
        autoFocus={props.autoFocusTitle}
        kbName={props.kbName}
        knowledgeBaseId={props.knowledgeBaseId}
        onToggleAi={props.onToggleAi}
        onTogglePanel={props.onTogglePanel}
        panelOpen={props.panelOpen}
        runtime={props.runtime}
      />{' '}
      {props.runtime.offline && (
        <OfflineNotice
          className="mx-6 mt-2"
          description="当前离线：正文转为只读，编辑与上传暂不可用。"
        />
      )}
      <div className="sticky top-(--header-height) z-20 border-b bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-prose items-center px-6">
          <EditorToolbar
            disabled={props.runtime.offline || props.runtime.save.status === 'conflict'}
            editor={props.runtime.editor}
          />
        </div>
      </div>
      <EditorBody detail={props.detail} runtime={props.runtime} searchTarget={props.searchTarget} />
      <AttachmentControls runtime={props.runtime} />
    </section>
  );
}

/** 用于承载一次编辑会话并组合各子组件。 */
export function DocumentEditorSession(props: DocumentEditorSessionProps) {
  const { detail, wide } = props;
  const runtime = useSessionRuntime(detail, props.offline, props.onReplace);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const panelProps = {
    contentDetail: detail,
    contentJson: runtime.contentJson,
    documentId: detail.id,
    getVersion: /** 用于读取当前保存基线版本。 */ () => runtime.save.getVersion(),
    onRestored: /** 用于恢复成功后丢弃本地快照并整体替换会话。 */ (next: DocumentContentDetail) =>
      replaceSession(runtime.save, runtime.triggers, props.onReplace, next),
  };
  /** 用于统一右栏开合：宽屏切换常驻栏折叠，中屏打开 Sheet。 */
  function togglePanel(): void {
    if (wide) setPanelCollapsed((current) => !current);
    else setSheetOpen(true);
  }
  return (
    <>
      <EditorSessionMain
        aiOpen={aiOpen}
        autoFocusTitle={props.autoFocusTitle}
        detail={detail}
        kbName={props.kbName}
        knowledgeBaseId={props.knowledgeBaseId}
        onToggleAi={() => setAiOpen((current) => !current)}
        onTogglePanel={togglePanel}
        panelOpen={wide ? !panelCollapsed : sheetOpen}
        runtime={runtime}
        searchTarget={props.searchTarget}
      />
      {!wide && <EditorPanelSheet onOpenChange={setSheetOpen} open={sheetOpen} {...panelProps} />}
      <EditorRightRail
        aiOpen={aiOpen}
        documentId={detail.id}
        infoTabs={<EditorPanelTabs {...panelProps} />}
        knowledgeBaseId={props.knowledgeBaseId}
        onAccept={(json) => applyAiDraft(runtime.editor, json, () => setAiOpen(false))}
        onToggleAi={() => setAiOpen(false)}
        panelCollapsed={panelCollapsed}
        wide={wide}
      />
    </>
  );
}
