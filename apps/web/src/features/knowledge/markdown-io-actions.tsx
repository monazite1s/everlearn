/** @fileoverview 渲染文档树头部的 Markdown 导入与知识库 ZIP 导出动作。 */

'use client';

import { DOCUMENT_SCHEMA_VERSION, type DocumentDetail } from '@everlearn/contracts';
import { DownloadIcon, FilePlusIcon, Loader2Icon } from 'lucide-react';
import { useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';

import { Alert, AlertDescription, Button } from '@everlearn/ui';

import { createDocument, exportDocuments } from './document-api';
import { exportDocumentsAsZip } from './markdown-zip';
import { markdownToImportableDocJson } from '../editor/markdown-conversion';
import { saveDocumentContent } from '../editor/editor-api';

/** 导入单文件大小上限，防止一次性解析超大 Markdown。 */
const IMPORT_MAX_BYTES = 5 * 1024 * 1024;

/** 用于从首个一级标题或文件名解析导入文档的标题。 */
function resolveImportTitle(markdown: string, fileName: string): string {
  const heading = /^#\s+(.+)$/m.exec(markdown);
  const fallback = fileName.replace(/\.md$/i, '');
  return (heading?.[1] ?? fallback).trim().slice(0, 200) || '无标题';
}

/** 用于校验文件类型与大小并返回错误提示。 */
function validateFile(file: File): string | undefined {
  if (/\.md$/i.exec(file.name) === null) return '仅支持 .md 文件。';
  if (file.size > IMPORT_MAX_BYTES) return '文件超过 5MB 上限。';
  return undefined;
}

/** 用于在知识库内把 Markdown 文件创建为新文档。 */
async function importMarkdownFile(knowledgeBaseId: string, file: File): Promise<DocumentDetail> {
  const markdown = await file.text();
  const created = await createDocument(knowledgeBaseId, {
    title: resolveImportTitle(markdown, file.name),
  });
  if (!created.ok) throw new Error(created.error.message);
  const saved = await saveDocumentContent(created.data.id, {
    contentJson: markdownToImportableDocJson(markdown),
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    version: created.data.version,
  });
  if (!saved.ok) throw new Error(saved.error.message);
  return saved.data;
}

/** 用于渲染共享失败提示。 */
function IoFailure({ message }: { message: string }): ReactNode {
  return (
    <Alert aria-live="polite" variant="destructive">
      <AlertDescription>
        <p className="m-0">{message}</p>
      </AlertDescription>
    </Alert>
  );
}

/** 用于持有文件选择与导入流程状态。 */
function useMarkdownImport(props: {
  knowledgeBaseId: string;
  onFailure: (message: string | undefined) => void;
  onImported: (detail: DocumentDetail) => void;
}) {
  const [importing, setImporting] = useState(false);
  /** 用于读取所选文件并走导入流程。 */
  async function onFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || importing) return;
    const invalid = validateFile(file);
    if (invalid) return props.onFailure(invalid);
    setImporting(true);
    props.onFailure(undefined);
    try {
      props.onImported(await importMarkdownFile(props.knowledgeBaseId, file));
    } catch (error) {
      props.onFailure(error instanceof Error ? error.message : '导入失败，请稍后重试。');
    } finally {
      setImporting(false);
    }
  }
  return { importing, onFileChange };
}

/** 用于渲染导入按钮与隐藏文件输入。 */
function ImportMarkdownButton(props: {
  disabled: boolean;
  knowledgeBaseId: string;
  onFailure: (message: string | undefined) => void;
  onImported: (detail: DocumentDetail) => void;
}) {
  const { importing, onFileChange } = useMarkdownImport(props);
  return (
    <label className="inline-flex cursor-pointer items-center">
      <Button
        aria-label="导入 Markdown"
        disabled={props.disabled || importing}
        size="sm"
        tabIndex={-1}
        variant="outline"
      >
        {importing ? (
          <Loader2Icon aria-hidden="true" className="animate-spin" />
        ) : (
          <FilePlusIcon aria-hidden="true" />
        )}
        导入 Markdown
      </Button>
      <input
        accept=".md,text/markdown"
        aria-hidden="true"
        className="hidden"
        onChange={(event) => void onFileChange(event)}
        tabIndex={-1}
        type="file"
      />
    </label>
  );
}

/** 用于拉取子树投影并打包下载 ZIP。 */
function ExportZipButton(props: {
  disabled: boolean;
  kbName?: string;
  knowledgeBaseId: string;
  onFailure: (message: string | undefined) => void;
}) {
  const [exporting, setExporting] = useState(false);
  /** 用于请求导出投影并在确认后触发下载。 */
  async function onExport(): Promise<void> {
    if (exporting) return;
    setExporting(true);
    props.onFailure(undefined);
    try {
      const result = await exportDocuments(props.knowledgeBaseId);
      if (!result.ok) throw new Error(result.error.message);
      exportDocumentsAsZip(result.data, props.kbName ?? '知识库导出');
    } catch (error) {
      props.onFailure(error instanceof Error ? error.message : '导出失败，请稍后重试。');
    } finally {
      setExporting(false);
    }
  }
  return (
    <Button
      disabled={props.disabled || exporting}
      onClick={() => void onExport()}
      size="sm"
      type="button"
      variant="outline"
    >
      <DownloadIcon aria-hidden="true" />
      导出 ZIP
    </Button>
  );
}

interface MarkdownIoActionsProps {
  readonly knowledgeBaseId: string;
  readonly kbName?: string;
  readonly offline: boolean;
  readonly onImported: (detail: DocumentDetail) => void;
}

/** 用于渲染导入导出按钮组与共享失败提示。 */
export function MarkdownIoActions(props: MarkdownIoActionsProps) {
  const [failure, setFailure] = useState<string>();
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <ImportMarkdownButton
          disabled={props.offline}
          knowledgeBaseId={props.knowledgeBaseId}
          onFailure={setFailure}
          onImported={props.onImported}
        />
        <ExportZipButton
          {...(props.kbName ? { kbName: props.kbName } : {})}
          disabled={props.offline}
          knowledgeBaseId={props.knowledgeBaseId}
          onFailure={setFailure}
        />
      </div>
      {failure && <IoFailure message={failure} />}
    </div>
  );
}

interface TreeMarkdownIoProps extends MarkdownIoActionsProps {
  desktop: boolean;
}

/** 用于只在桌面端挂载导入导出动作。 */
export function TreeMarkdownIo(props: TreeMarkdownIoProps) {
  if (!props.desktop) return null;
  return <MarkdownIoActions {...props} />;
}
