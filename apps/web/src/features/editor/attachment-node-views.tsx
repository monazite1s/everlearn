/** @fileoverview 渲染图片与通用附件节点的上传中、失败与就绪三态视图。 */

'use client';

import { DownloadIcon, FileIcon, RotateCcwIcon, XIcon } from 'lucide-react';
import { NodeViewWrapper } from '@tiptap/react';

import { Button, Progress, Skeleton } from '@everlearn/ui';

/** AttachmentNodeView 的 props 契约。 */
export interface AttachmentNodeViewProps {
  kind: 'attachment' | 'image';
  label: string | null;
  attachmentId: string | null;
  uploading: boolean;
  failed: boolean;
  onRetry: () => void;
  onRemove: () => void;
}

/** 用于按附件用途构造授权下载地址。 */
export function attachmentDownloadHref(attachmentId: string): string {
  return `/api/v1/attachments/${encodeURIComponent(attachmentId)}/content`;
}

/** 用于渲染上传中的骨架占位并保持固定高度防跳动。 */
function UploadingBlock(props: { label: string | null }) {
  return (
    <div aria-label="正在上传附件" className="grid gap-2 py-2" role="status">
      <Skeleton className="h-4 w-40" />
      <Progress className="h-0.5 w-full" value={undefined} />
      {props.label && <p className="m-0 text-caption text-muted-foreground">{props.label}</p>}
    </div>
  );
}

/** 用于渲染失败占位并提供重试与移除入口。 */
function FailedBlock(props: { label: string | null; onRetry: () => void; onRemove: () => void }) {
  return (
    <div
      className="flex min-h-12 items-center justify-between gap-2 rounded-md border border-destructive/40 bg-background px-3 py-2"
      role="alert"
    >
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {props.label ?? '附件'}上传失败
      </span>
      <Button onClick={props.onRetry} size="icon-xs" type="button" variant="ghost">
        <RotateCcwIcon aria-hidden="true" />
        <span className="sr-only">重试上传</span>
      </Button>
      <Button onClick={props.onRemove} size="icon-xs" type="button" variant="ghost">
        <XIcon aria-hidden="true" />
        <span className="sr-only">移除占位</span>
      </Button>
    </div>
  );
}

/** 用于渲染就绪的图片展示。 */
function ReadyImage(props: { alt: string | null; attachmentId: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 附件图片经授权流动态加载，next/image 不适用
    <img
      alt={props.alt ?? ''}
      className="max-w-full rounded-md"
      src={attachmentDownloadHref(props.attachmentId)}
    />
  );
}

/** 用于渲染就绪的附件文件行与授权下载入口。 */
function ReadyAttachment(props: { attachmentId: string; label: string | null }) {
  const fileName = props.label ?? '附件';
  return (
    <div className="flex min-h-12 items-center gap-2 rounded-md border border-input bg-background px-3 py-2">
      <FileIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={fileName}>
        {fileName}
      </span>
      <Button asChild size="icon-xs" type="button" variant="ghost">
        <a download={fileName} href={attachmentDownloadHref(props.attachmentId)}>
          <DownloadIcon aria-hidden="true" />
          <span className="sr-only">下载 {fileName}</span>
        </a>
      </Button>
    </div>
  );
}

/** 用于按节点属性分派附件三态渲染并承接占位交互。 */
export function AttachmentNodeView(props: AttachmentNodeViewProps) {
  return (
    <NodeViewWrapper as="div" className="my-2 not-prose">
      {props.failed ? (
        <FailedBlock label={props.label} onRetry={props.onRetry} onRemove={props.onRemove} />
      ) : props.uploading || props.attachmentId === null ? (
        <UploadingBlock label={props.label} />
      ) : props.kind === 'image' ? (
        <ReadyImage alt={props.label} attachmentId={props.attachmentId} />
      ) : (
        <ReadyAttachment attachmentId={props.attachmentId} label={props.label} />
      )}
    </NodeViewWrapper>
  );
}
