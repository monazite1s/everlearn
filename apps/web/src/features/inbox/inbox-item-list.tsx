/** @fileoverview 渲染 Inbox 待处理记录列表与删除确认。 */

'use client';

import type { InboxItemSummary } from '@everlearn/contracts';
import { AlertCircleIcon, InboxIcon, Loader2Icon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import type { RefObject } from 'react';

import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  Skeleton,
} from '@everlearn/ui';

import { EmptyState } from '../../shared/empty-state';
import { formatDateTime } from '../../shared/format-datetime';
import { LoadFailure } from '../../shared/load-failure';
import { deleteInboxItem } from './inbox-api';
import type { InboxApiFailure } from './inbox-api';
import type { InboxLoadState } from './inbox-list-state';

const PREVIEW_LENGTH = 60;

/** 用于生成确认与可访问名称中截断的内容预览。 */
function previewContent(content: string): string {
  return content.length > PREVIEW_LENGTH ? `${content.slice(0, PREVIEW_LENGTH)}…` : content;
}

/** 用于渲染镜像列表行布局的加载骨架。 */
function InboxSkeleton() {
  return (
    <div aria-label="正在加载记录" className="grid gap-4 py-4" role="status">
      {[0, 1, 2].map((index) => (
        <div className="grid gap-2" key={index}>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3.5 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/** 用于渲染一条待处理记录及其桌面删除入口。 */
function InboxItemRow(props: { desktop: boolean; item: InboxItemSummary; onDelete: () => void }) {
  const { desktop, item, onDelete } = props;
  const preview = previewContent(item.content);
  return (
    <li className="grid gap-1.5 py-4 first:pt-0 last:pb-0">
      <p className="m-0 line-clamp-2 text-sm break-words whitespace-pre-line text-foreground">
        {item.content}
      </p>
      <div className="flex items-center gap-2">
        <Badge variant="secondary">{item.kind === 'url' ? '链接' : '文本'}</Badge>
        <span className="text-caption text-muted-foreground">
          记录于 {formatDateTime(item.createdAt)}
        </span>
        {desktop && (
          <Button
            aria-label={`删除记录“${preview}”`}
            className="ml-auto text-destructive"
            onClick={onDelete}
            size="icon-sm"
            variant="ghost"
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        )}
      </div>
    </li>
  );
}

/** 用于渲染 Inbox 首次使用的结构化空态。 */
function InboxEmptyState(props: { desktop: boolean; onFocusInput: () => void }) {
  return (
    <EmptyState
      action={
        props.desktop ? (
          <Button onClick={props.onFocusInput} variant="outline">
            写下第一条记录
          </Button>
        ) : undefined
      }
      description="先在这里记录想法或链接，之后再集中整理进知识库。"
      icon={InboxIcon}
      title="Inbox 还是空的"
    />
  );
}

interface RemovalProps {
  readonly onRemoved: (id: string) => void;
  readonly onResync: () => Promise<readonly InboxItemSummary[] | undefined>;
}

/** 用于管理删除请求且只在确认成功后移除记录。 */
function useInboxRemoval(props: RemovalProps) {
  const [pendingDelete, setPendingDelete] = useState<InboxItemSummary>();
  const [deleting, setDeleting] = useState(false);
  const [deleteFailure, setDeleteFailure] = useState<InboxApiFailure>();
  /** 用于执行删除并在结果不确定时重读服务端事实。 */
  async function confirmDelete(): Promise<void> {
    if (!pendingDelete || deleting) return;
    setDeleting(true);
    setDeleteFailure(undefined);
    const result = await deleteInboxItem(pendingDelete.id);
    setDeleting(false);
    if (result.ok) {
      props.onRemoved(pendingDelete.id);
      setPendingDelete(undefined);
      return;
    }
    if (result.error.certainty === 'unknown') {
      const target = pendingDelete;
      setPendingDelete(undefined);
      const fresh = await props.onResync();
      if (fresh?.some((item) => item.id === target.id)) {
        setPendingDelete(target);
        setDeleteFailure(result.error);
      }
      return;
    }
    setDeleteFailure(result.error);
  }
  return { confirmDelete, deleteFailure, deleting, pendingDelete, setPendingDelete };
}

interface DeleteDialogProps {
  readonly deleting: boolean;
  readonly failure?: InboxApiFailure;
  readonly item: InboxItemSummary;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

/** 用于在删除记录前确认影响。 */
function InboxDeleteDialog(props: DeleteDialogProps) {
  const { deleting, failure, item, onClose, onConfirm } = props;
  return (
    <AlertDialog onOpenChange={(next) => (!next && !deleting ? onClose() : undefined)} open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除这条记录</AlertDialogTitle>
          <AlertDialogDescription>
            将删除“{previewContent(item.content)}”。删除后无法在当前版本恢复，请确认后再继续。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failure && (
          <Alert variant="destructive">
            <AlertCircleIcon aria-hidden="true" />
            <AlertTitle>删除失败</AlertTitle>
            <AlertDescription>
              <p className="m-0">{failure.message}</p>
            </AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            disabled={deleting}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            variant="destructive"
          >
            {deleting && <Loader2Icon aria-hidden="true" className="animate-spin" size={16} />}
            确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface InboxListContentProps {
  readonly desktop: boolean;
  readonly inputRef: RefObject<HTMLTextAreaElement | null>;
  readonly items: readonly InboxItemSummary[];
  readonly load: InboxLoadState;
  readonly onDelete: (item: InboxItemSummary) => void;
  readonly onLoadMore: () => void;
  readonly onRetry: () => void;
}

/** 用于渲染列表内容并局部处理分页失败。 */
function InboxListContent(props: InboxListContentProps) {
  const { desktop, inputRef, items, load, onDelete, onLoadMore, onRetry } = props;
  if (load.loading && items.length === 0) return <InboxSkeleton />;
  if (load.error && items.length === 0) {
    return <LoadFailure description={load.error.message} onRetry={onRetry} title="Inbox 未加载" />;
  }
  if (items.length === 0) {
    return <InboxEmptyState desktop={desktop} onFocusInput={() => inputRef.current?.focus()} />;
  }
  return (
    <>
      <ul className="m-0 grid list-none divide-y divide-border p-0">
        {items.map((item) => (
          <InboxItemRow
            desktop={desktop}
            item={item}
            key={item.id}
            onDelete={() => onDelete(item)}
          />
        ))}
      </ul>
      {load.error && (
        <LoadFailure description={load.error.message} onRetry={onRetry} title="记录未加载" />
      )}
      {!load.error && load.nextCursor && (
        <Button className="mt-4" disabled={load.loading} onClick={onLoadMore} variant="outline">
          {load.loading && <Loader2Icon aria-hidden="true" className="animate-spin" />}
          加载更多
        </Button>
      )}
    </>
  );
}

interface InboxItemListProps {
  readonly desktop: boolean;
  readonly inputRef: RefObject<HTMLTextAreaElement | null>;
  readonly items: readonly InboxItemSummary[];
  readonly load: InboxLoadState;
  readonly onLoadMore: () => void;
  readonly onRemoved: (id: string) => void;
  readonly onResync: () => Promise<readonly InboxItemSummary[] | undefined>;
  readonly onRetry: () => void;
}

/** 用于组合记录列表与删除确认流程。 */
export function InboxItemList(props: InboxItemListProps) {
  const removal = useInboxRemoval({ onRemoved: props.onRemoved, onResync: props.onResync });
  return (
    <>
      <InboxListContent
        desktop={props.desktop}
        inputRef={props.inputRef}
        items={props.items}
        load={props.load}
        onDelete={removal.setPendingDelete}
        onLoadMore={props.onLoadMore}
        onRetry={props.onRetry}
      />
      {removal.pendingDelete && (
        <InboxDeleteDialog
          deleting={removal.deleting}
          item={removal.pendingDelete}
          onClose={() => removal.setPendingDelete(undefined)}
          onConfirm={() => void removal.confirmDelete()}
          {...(removal.deleteFailure ? { failure: removal.deleteFailure } : {})}
        />
      )}
    </>
  );
}
