/** @fileoverview 组合附件选择、确认、上传执行、占位重试与序列化过滤。 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor, JSONContent } from '@tiptap/core';
import { ImageIcon, PaperclipIcon } from 'lucide-react';

import {
  ATTACHMENT_FILE_EXTENSIONS,
  ATTACHMENT_IMAGE_MIME_TYPES,
  DOCUMENT_BLOCK_ID_PATTERN,
} from '@everlearn/contracts';

import type { SlashMenuItem } from './slash-menu';
import { attrString } from './attachment-nodes';
import {
  resolveAttachmentKind,
  type AttachmentUploadController,
  type PendingAttachmentKind,
} from './use-attachment-upload';

/** 待确认上传的文件与用途分类。 */
export interface PendingAttachmentFile {
  readonly file: File;
  readonly kind: PendingAttachmentKind;
}

/** 上传会话依赖的稳定引用集合。 */
interface AttachmentRuntime {
  /** 当前编辑器实例引用，占位插入按引用即时读取。 */
  readonly editorRef: { current: Editor | null };
  /** 失败占位重试所需的原始文件表。 */
  readonly files: Map<string, PendingAttachmentFile>;
  readonly upload: AttachmentUploadController;
}

/** 暴露给编辑器宿主的附件会话控制器。 */
export interface DocumentAttachmentsController {
  /** 待确认上传的文件。 */
  readonly pending: PendingAttachmentFile | undefined;
  readonly slashItems: readonly SlashMenuItem[];
  readonly cancelPending: () => void;
  readonly confirmPending: () => void;
  /** 用于消费粘贴或拖入文件，返回是否已被本模块处理。 */
  readonly receiveFiles: (files: readonly File[]) => boolean;
  readonly retryUpload: (blockId: string) => void;
  /** 用于挂载隐藏文件选择 input 的回调 ref。 */
  readonly registerPicker: (element: HTMLInputElement | null) => void;
  /** 用于绑定宿主隐藏的文件选择 input。 */
  readonly picker: {
    readonly accept: string;
    readonly onChange: (event: { currentTarget: HTMLInputElement }) => void;
  };
}

/** 用于剔除尚未拿到合法附件 id 的占位节点，避免提交无效块。 */
export function omitPendingAttachments(json: JSONContent): JSONContent {
  if (!Array.isArray(json.content)) return json;
  const content = json.content
    .filter((node) => {
      const attachmentId = attrString(node.attrs?.attachmentId);
      return (
        (node.type !== 'image' && node.type !== 'attachment') ||
        (typeof attachmentId === 'string' && DOCUMENT_BLOCK_ID_PATTERN.test(attachmentId))
      );
    })
    .map(omitPendingAttachments);
  return { ...json, content };
}

/** 用于按 blockId 定位并更新附件节点属性。 */
function patchAttachmentNode(
  editor: Editor,
  blockId: string,
  attrs: Record<string, unknown>,
): void {
  const { doc, tr } = editor.state;
  const positions: number[] = [];
  doc.descendants((node, pos) => {
    if (node.attrs.blockId === blockId) positions.push(pos);
    return true;
  });
  const position = positions.at(-1);
  if (position === undefined) return;
  const node = doc.nodeAt(position);
  if (!node) return;
  editor.view.dispatch(tr.setNodeMarkup(position, undefined, { ...node.attrs, ...attrs }));
}

/** 用于插入或重置一个上传占位节点。 */
function stagePlaceholder(
  editor: Editor,
  entry: PendingAttachmentFile,
  blockId: string,
  isRetry: boolean,
): void {
  if (isRetry) {
    patchAttachmentNode(editor, blockId, { failed: false, uploading: true });
    return;
  }
  const labelAttrs =
    entry.kind === 'image' ? { alt: entry.file.name } : { fileName: entry.file.name };
  editor
    .chain()
    .insertContent({
      attrs: { attachmentId: null, blockId, uploading: true, ...labelAttrs },
      type: entry.kind === 'image' ? 'image' : 'attachment',
    })
    .run();
}

/** 用于把一次上传结论回写为占位节点的最终属性。 */
function applyUploadOutcome(
  editor: Editor,
  files: Map<string, PendingAttachmentFile>,
  blockId: string,
  outcome: Awaited<ReturnType<AttachmentUploadController['upload']>>,
): void {
  if (outcome.ok) {
    patchAttachmentNode(editor, blockId, {
      attachmentId: outcome.attachmentId,
      failed: false,
      uploading: false,
    });
    files.delete(blockId);
    return;
  }
  patchAttachmentNode(editor, blockId, { failed: true, uploading: false });
}

/** 用于执行一次占位插入与两段式上传并回写结果，重试时复用既有占位。 */
async function uploadWithPlaceholder(
  runtime: AttachmentRuntime,
  entry: PendingAttachmentFile,
  retryBlockId?: string,
): Promise<void> {
  const editor = runtime.editorRef.current;
  if (!editor) return;
  const blockId = retryBlockId ?? crypto.randomUUID();
  if (retryBlockId === undefined) runtime.files.set(blockId, entry);
  stagePlaceholder(editor, entry, blockId, retryBlockId !== undefined);
  const outcome = await runtime.upload.upload(entry.file);
  if (runtime.editorRef.current !== editor) return;
  applyUploadOutcome(editor, runtime.files, blockId, outcome);
}

/** 用于把受支持文件转换为可上传条目。 */
function toSupportedEntry(file: File): PendingAttachmentFile | undefined {
  const kind = resolveAttachmentKind(file);
  return kind === undefined ? undefined : { file, kind };
}

/** 用于消费粘贴或拖入文件：全部受支持文件直接上传。 */
function receiveDroppedFiles(
  disabled: boolean,
  files: readonly File[],
  start: (entry: PendingAttachmentFile) => void,
): boolean {
  if (disabled || files.length === 0) return false;
  const entries = files
    .map(toSupportedEntry)
    .filter((entry): entry is PendingAttachmentFile => entry !== undefined);
  if (entries.length === 0) return false;
  for (const entry of entries) start(entry);
  return true;
}

/** 用于构造图片与附件两个 Slash 菜单插入项。 */
function createSlashItems(openPicker: () => void) {
  return [
    {
      command: /** 用于打开文件选择器插入图片。 */ () => openPicker(),
      group: '插入',
      icon: ImageIcon,
      keywords: ['image', 'picture', 'tupian'],
      label: '图片',
      value: 'image-upload',
    },
    {
      command: /** 用于打开文件选择器插入附件。 */ () => openPicker(),
      group: '插入',
      icon: PaperclipIcon,
      keywords: ['attachment', 'file', 'fujian'],
      label: '附件',
      value: 'attachment-upload',
    },
  ] as const satisfies readonly SlashMenuItem[];
}

/** 用于管理附件选择确认、上传会话与 Slash 菜单插入项。 */
export function useDocumentAttachments(options: {
  readonly disabled: boolean;
  readonly editorRef: { current: Editor | null };
  readonly upload: AttachmentUploadController;
}): DocumentAttachmentsController {
  const { disabled, editorRef, upload } = options;
  const [pending, setPending] = useState<PendingAttachmentFile | undefined>();
  const [pickerInput, setPickerInput] = useState<HTMLInputElement | null>(null);
  const filesRef = useRef(new Map<string, PendingAttachmentFile>());
  const runtimeRef = useRef<AttachmentRuntime>({ editorRef, files: new Map(), upload });

  useEffect(() => {
    runtimeRef.current = { editorRef, files: filesRef.current, upload };
  }, [editorRef, upload]);

  /** 用于发起一次受支持文件的上传，可指定既有占位原地重试。 */
  const startUpload = useCallback((entry: PendingAttachmentFile, retryBlockId?: string) => {
    void uploadWithPlaceholder(runtimeRef.current, entry, retryBlockId);
  }, []);

  const slashItems = useMemo(
    /** 用于构造打开系统文件选择器的 Slash 插入项。 */ () =>
      createSlashItems(() => clickPicker(disabled, pickerInput)),
    [disabled, pickerInput],
  );

  const handlePicked = /** 用于读取选择器结果并进入确认流程。 */ (event: {
    currentTarget: HTMLInputElement;
  }) => applyPickedFile(setPending, event);

  return {
    pending,
    slashItems,
    cancelPending: /** 用于放弃待确认文件。 */ () => setPending(undefined),
    confirmPending: /** 用于确认后立即上传。 */ () => {
      if (pending) startUpload(pending);
      setPending(undefined);
    },
    receiveFiles: /** 用于承接粘贴与拖入文件并直接上传。 */ (files) =>
      receiveDroppedFiles(disabled, files, startUpload),
    retryUpload: /** 用于按 blockId 原地重试失败占位。 */ (blockId) =>
      retryPlaceholder(filesRef, startUpload, blockId),
    picker: { accept: pickerAcceptList(), onChange: handlePicked },
    registerPicker: setPickerInput,
  };
}

/** 用于把选择到的受支持文件登记为待确认条目。 */
function applyPickedFile(
  setPending: (entry: PendingAttachmentFile | undefined) => void,
  event: { currentTarget: HTMLInputElement },
): void {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = '';
  const entry = file === undefined ? undefined : toSupportedEntry(file);
  if (entry) setPending(entry);
}

/** 用于按 blockId 查原始文件并原地重试失败占位。 */
function retryPlaceholder(
  filesRef: { current: Map<string, PendingAttachmentFile> },
  start: (entry: PendingAttachmentFile, retryBlockId?: string) => void,
  blockId: string,
): void {
  const entry = filesRef.current.get(blockId);
  if (entry) start(entry, blockId);
}

/** 用于构造隐藏选择 input 的 accept 白名单。 */
function pickerAcceptList(): string {
  return [
    ...ATTACHMENT_IMAGE_MIME_TYPES,
    ...ATTACHMENT_FILE_EXTENSIONS.map((extension) => `.${extension}`),
  ].join(',');
}

/** 用于在未禁用时点击隐藏的文件选择器。 */
function clickPicker(disabled: boolean, input: HTMLInputElement | null): void {
  if (!disabled) input?.click();
}
