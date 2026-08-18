/** @fileoverview 渲染修订时间轴、只读预览与带二次确认的恢复流程。 */

'use client';

import { useState } from 'react';
import type { DocumentContentDetail, DocumentRevisionListItem } from '@everlearn/contracts';
import { AlertCircleIcon, HistoryIcon, Loader2Icon, SparklesIcon, UploadIcon } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Skeleton,
} from '@everlearn/ui';

import { formatDateTime } from '../../shared/format-datetime';
import { restoreDocumentRevision } from './editor-api';
import type { RevisionsController } from './use-revisions';
import { useRevisionPreview } from './use-revision-preview';

/** 用于按修订来源映射徽标变体与图标。 */
const SOURCE_BADGES = {
  ai: { icon: SparklesIcon, label: 'AI', variant: 'default' },
  automation: { icon: HistoryIcon, label: '自动化', variant: 'secondary' },
  import: { icon: UploadIcon, label: '导入', variant: 'secondary' },
  manual: { icon: undefined, label: '手动', variant: 'outline' },
  restore: { icon: HistoryIcon, label: '恢复', variant: 'secondary' },
} as const;

/** 用于渲染来源徽标，未知来源回退手动样式。 */
function RevisionSourceBadge(props: { source: DocumentRevisionListItem['source'] }) {
  const badge = SOURCE_BADGES[props.source];
  const Icon = badge.icon;
  return (
    <Badge variant={badge.variant}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {badge.label}
    </Badge>
  );
}

/** 用于渲染单个修订时间轴节点。 */
function RevisionRow(props: {
  readonly expanded: boolean;
  readonly item: DocumentRevisionListItem;
  readonly onToggle: () => void;
}) {
  return (
    <div className="relative pl-5">
      <span
        aria-hidden="true"
        className="absolute top-1.5 left-0 size-1.5 rounded-full bg-primary"
      />
      <button
        aria-expanded={props.expanded}
        className="w-full rounded-md px-1 py-1.5 text-left transition-colors hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring"
        onClick={props.onToggle}
        type="button"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-xs text-muted-foreground">
            #{props.item.revisionNumber}
          </span>
          <RevisionSourceBadge source={props.item.source} />
          <span className="text-xs text-muted-foreground">
            {formatDateTime(props.item.createdAt)}
          </span>
        </span>
        <span className="mt-1 line-clamp-2 block text-sm text-foreground">
          {props.item.snippet || '（无正文摘要）'}
        </span>
      </button>
    </div>
  );
}

/** 用于渲染修订全文的只读预览分支。 */
function RevisionPreviewContent(props: {
  readonly documentId: string;
  readonly revisionNumber: number;
}) {
  const { revision, status } = useRevisionPreview({
    documentId: props.documentId,
    revisionNumber: props.revisionNumber,
  });
  if (status === 'loading') return <Skeleton className="h-20 w-full" />;
  if (status === 'failed') {
    return (
      <p className="m-0 text-sm text-destructive" role="alert">
        修订预览未加载，请稍后重试。
      </p>
    );
  }
  if (!revision) return null;
  return (
    <>
      <p className="m-0 text-sm font-medium text-foreground">{revision.title}</p>
      <pre className="mt-2 mb-0 max-h-64 overflow-auto font-sans text-sm whitespace-pre-wrap text-muted-foreground">
        {revision.plainText || '（无正文）'}
      </pre>
    </>
  );
}

/** 用于管理恢复提交与二次确认对话框。 */
function RestoreFlow(props: {
  readonly documentId: string;
  readonly getVersion: () => number;
  readonly revisionNumber: number;
  readonly onRestored: (detail: DocumentContentDetail) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [failure, setFailure] = useState<string | undefined>();

  /** 用于在二次确认后提交恢复并把新内容交回宿主。 */
  async function restore(): Promise<void> {
    setRestoring(true);
    setFailure(undefined);
    const result = await restoreDocumentRevision(props.documentId, props.revisionNumber, {
      version: props.getVersion(),
    });
    setRestoring(false);
    if (result.ok) {
      setConfirmOpen(false);
      props.onRestored(result.data);
      return;
    }
    setFailure(result.error.message);
  }

  return (
    <div className="mt-3 flex items-center gap-2">
      <Button disabled={restoring} onClick={() => setConfirmOpen(true)} size="sm" type="button">
        {restoring && (
          <Loader2Icon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
        )}
        恢复此版本
      </Button>
      {failure && (
        <span className="text-sm text-destructive" role="alert">
          {failure}
        </span>
      )}
      <RestoreConfirmDialog
        onConfirm={() => void restore()}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        revisionNumber={props.revisionNumber}
      />
    </div>
  );
}

/** 用于渲染恢复前的二次确认对话框。 */
function RestoreConfirmDialog(props: {
  readonly onConfirm: () => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
  readonly revisionNumber: number;
}) {
  return (
    <AlertDialog onOpenChange={props.onOpenChange} open={props.open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>恢复到修订 #{props.revisionNumber}？</AlertDialogTitle>
          <AlertDialogDescription>
            将创建新的恢复修订，不会改写历史；当前正文中未保存的改动将被替换。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={props.onConfirm}>确认恢复</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** 用于渲染展开修订的只读预览与恢复入口。 */
function RevisionPreviewArea(props: {
  readonly documentId: string;
  readonly getVersion: () => number;
  readonly item: DocumentRevisionListItem;
  readonly onRestored: (detail: DocumentContentDetail) => void;
}) {
  return (
    <div className="mt-2 mb-2 rounded-md border border-border bg-card p-3">
      <RevisionPreviewContent
        documentId={props.documentId}
        revisionNumber={props.item.revisionNumber}
      />
      <RestoreFlow
        documentId={props.documentId}
        getVersion={props.getVersion}
        revisionNumber={props.item.revisionNumber}
        onRestored={props.onRestored}
      />
    </div>
  );
}

/** RevisionsPanel 的 props 契约。 */
export interface RevisionsPanelProps {
  readonly documentId: string;
  readonly getVersion: () => number;
  readonly revisions: RevisionsController;
  readonly onRestored: (detail: DocumentContentDetail) => void;
}

/** 用于渲染首屏加载骨架。 */
function RevisionsLoading() {
  return (
    <div aria-label="正在加载修订历史" className="grid gap-2 py-2" role="status">
      <Skeleton className="h-14" />
      <Skeleton className="h-14 w-5/6" />
    </div>
  );
}

/** 用于渲染首屏失败与就地重试。 */
function RevisionsLoadFailure(props: { readonly onRetry: () => void }) {
  return (
    <div className="flex items-start gap-2 py-2 text-sm text-destructive" role="alert">
      <AlertCircleIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>
        修订历史未加载。
        <Button className="ml-1" onClick={props.onRetry} size="xs" variant="ghost">
          重试
        </Button>
      </span>
    </div>
  );
}

/** 用于渲染修订历史时间轴、预览、恢复与分页。 */
export function RevisionTimelinePanel(props: RevisionsPanelProps) {
  const { revisions } = props;
  const [expandedNumber, setExpandedNumber] = useState<number | undefined>();
  if (revisions.status === 'loading' && revisions.items.length === 0) return <RevisionsLoading />;
  if (revisions.status === 'failed' && revisions.items.length === 0) {
    return <RevisionsLoadFailure onRetry={revisions.reload} />;
  }
  if (revisions.items.length === 0) {
    return <p className="py-2 text-sm text-muted-foreground">尚无修订。</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-1">
      <RevisionItems
        expandedNumber={expandedNumber}
        onExpand={setExpandedNumber}
        panelProps={props}
      />
      <RevisionsTail revisions={revisions} />
    </div>
  );
}

/** 用于渲染修订时间轴条目与展开预览。 */
function RevisionItems(props: {
  expandedNumber: number | undefined;
  onExpand: (number: number | undefined) => void;
  panelProps: RevisionsPanelProps;
}) {
  const { revisions } = props.panelProps;
  return (
    <>
      <ol
        aria-label="修订历史"
        className="m-0 grid list-none gap-1 border-l border-border pl-2 grid-cols-[minmax(0,1fr)]"
      >
        {revisions.items.map((item) => (
          <li key={item.revisionNumber}>
            <RevisionRow
              expanded={props.expandedNumber === item.revisionNumber}
              item={item}
              onToggle={() =>
                props.onExpand(
                  props.expandedNumber === item.revisionNumber ? undefined : item.revisionNumber,
                )
              }
            />
            {props.expandedNumber === item.revisionNumber && (
              <RevisionPreviewArea
                documentId={props.panelProps.documentId}
                getVersion={props.panelProps.getVersion}
                item={item}
                onRestored={props.panelProps.onRestored}
              />
            )}
          </li>
        ))}
      </ol>
    </>
  );
}

/** 用于渲染分页加载入口与部分失败提示。 */
function RevisionsTail(props: { revisions: RevisionsController }) {
  const { revisions } = props;
  return (
    <>
      {revisions.nextCursor !== null && (
        <Button
          className="mt-1"
          disabled={revisions.paging}
          onClick={revisions.loadMore}
          size="xs"
          type="button"
          variant="ghost"
        >
          {revisions.paging && (
            <Loader2Icon aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
          )}
          加载更多
        </Button>
      )}
      {revisions.status === 'failed' && revisions.items.length > 0 && (
        <p className="m-0 text-sm text-destructive" role="alert">
          下一页加载失败，可重试。
        </p>
      )}
    </>
  );
}
