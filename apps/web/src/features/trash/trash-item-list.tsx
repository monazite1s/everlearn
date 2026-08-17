/** @fileoverview 渲染回收站条目列表、前置引导与恢复确认流程。 */

'use client';

import type { TrashItem } from '@everlearn/contracts';
import { AlertCircleIcon, ArchiveRestoreIcon, Loader2Icon, Trash2Icon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from '@everlearn/ui';

import { EmptyState } from '../../shared/empty-state';
import { formatDateTime } from '../../shared/format-datetime';
import { LoadFailure } from '../../shared/load-failure';
import { restoreDocument } from '../knowledge/document-api';
import type { DocumentApiFailure } from '../knowledge/document-api';
import { restoreKnowledgeBase } from '../knowledge/knowledge-api';
import type { KnowledgeApiFailure } from '../knowledge/knowledge-api';
import type { TrashLoadState } from './trash-list-state';

type RestoreFailure = KnowledgeApiFailure | DocumentApiFailure;

interface PendingRestore {
  readonly item: TrashItem;
  readonly key: string;
}

/** 用于返回已加载页内仍未恢复的知识库条目标识集合。 */
function collectBlockedKnowledgeBaseIds(items: readonly TrashItem[]): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.objectType === 'knowledge-base') ids.add(item.id);
  }
  return ids;
}

/** 用于渲染镜像回收站行布局的加载骨架。 */
function TrashSkeleton() {
  return (
    <div aria-label="正在加载回收站" className="grid gap-4 py-4" role="status">
      {[0, 1, 2].map((index) => (
        <div className="grid gap-2" key={index}>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3.5 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** 用于渲染回收站首次使用的结构化空态。 */
function TrashEmptyState() {
  return (
    <EmptyState
      action={
        <Button asChild variant="outline">
          <Link href="/knowledge">返回知识库</Link>
        </Button>
      }
      description="已删除的知识库与文档会在这里按保留期暂存，到期后由系统永久清理。"
      icon={Trash2Icon}
      title="回收站是空的"
    />
  );
}

/** 用于渲染单条回收站条目的元信息行。 */
function TrashItemMeta({ item }: { item: TrashItem }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
      {item.objectType === 'document' && <span>原知识库：{item.knowledgeBaseName}</span>}
      <span>删除于 {formatDateTime(item.deletedAt)}</span>
      <span>永久删除于 {formatDateTime(item.purgeScheduledAt)}</span>
    </div>
  );
}

/** 用于渲染单条回收站条目与桌面恢复入口或前置指引。 */
function TrashItemRow(props: {
  blockedKnowledgeBaseIds: ReadonlySet<string>;
  desktop: boolean;
  item: TrashItem;
  offline: boolean;
  onRestore: (item: TrashItem) => void;
}) {
  const { blockedKnowledgeBaseIds, desktop, item, offline, onRestore } = props;
  const blocked =
    item.objectType === 'document' && blockedKnowledgeBaseIds.has(item.knowledgeBaseId);
  return (
    <li className="grid gap-1.5 py-4 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-2">
        <Badge variant="secondary">
          {item.objectType === 'knowledge-base' ? '知识库' : '文档'}
        </Badge>
        <p className="m-0 min-w-0 truncate text-sm font-medium text-foreground">{item.title}</p>
        {desktop &&
          (blocked ? (
            <span className="ml-auto shrink-0 text-sm text-muted-foreground">
              先恢复其知识库“{item.knowledgeBaseName}”
            </span>
          ) : (
            <Button
              aria-label={`恢复“${item.title}”`}
              className="ml-auto shrink-0"
              disabled={offline}
              onClick={() => onRestore(item)}
              size="sm"
              variant="outline"
            >
              <ArchiveRestoreIcon aria-hidden="true" />
              恢复
            </Button>
          ))}
      </div>
      <TrashItemMeta item={item} />
    </li>
  );
}

/** 用于在恢复前说明对象类型与恢复影响。 */
function describeRestoreImpact(item: TrashItem): string {
  if (item.objectType === 'knowledge-base') {
    return `“${item.title}”将恢复到知识库列表。仍在回收站中的文档条目不受影响。`;
  }
  return `“${item.title}”将连同其完整子树恢复到原知识库“${item.knowledgeBaseName}”。`;
}

interface RestoreDialogProps {
  readonly failure?: RestoreFailure;
  readonly item: TrashItem;
  readonly offline: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly restoring: boolean;
}

/** 用于渲染恢复确认对话框并展示服务端失败消息。 */
function TrashRestoreDialog(props: RestoreDialogProps) {
  const { failure, item, offline, onClose, onConfirm, restoring } = props;
  return (
    <Dialog onOpenChange={(next) => (!next && !restoring ? onClose() : undefined)} open>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>
            {item.objectType === 'knowledge-base' ? '恢复知识库' : '恢复文档'}
          </DialogTitle>
          <DialogDescription>{describeRestoreImpact(item)}</DialogDescription>
        </DialogHeader>
        {failure && (
          <Alert variant="destructive">
            <AlertCircleIcon aria-hidden="true" />
            <AlertTitle>恢复失败</AlertTitle>
            <AlertDescription>
              <p className="m-0">{failure.message}</p>
            </AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button disabled={restoring} onClick={onClose} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={restoring || offline} onClick={onConfirm} type="button">
            {restoring && <Loader2Icon aria-hidden="true" className="animate-spin" size={16} />}
            确认恢复
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface RestoreHookProps {
  readonly onRestored: () => Promise<readonly TrashItem[] | undefined>;
}

/** 用于按一次幂等键管理恢复意图并按服务端事实收尾。 */
function useTrashRestore(props: RestoreHookProps) {
  const [pending, setPending] = useState<PendingRestore>();
  const [restoring, setRestoring] = useState(false);
  const [failure, setFailure] = useState<RestoreFailure>();
  /** 用于开启一次恢复意图并生成仅属于本次操作的幂等键。 */
  function open(item: TrashItem): void {
    setPending({ item, key: crypto.randomUUID() });
    setFailure(undefined);
  }
  /** 用于在取消或得到确定结果后丢弃当前幂等键。 */
  function close(): void {
    if (restoring) return;
    setPending(undefined);
    setFailure(undefined);
  }
  /** 用于提交恢复并在结果未知时以服务端重读为准。 */
  async function confirm(): Promise<void> {
    if (!pending || restoring) return;
    const { item, key } = pending;
    setRestoring(true);
    setFailure(undefined);
    const result =
      item.objectType === 'knowledge-base'
        ? await restoreKnowledgeBase(item.id, { version: item.version }, key)
        : await restoreDocument(item.id, { version: item.version }, key);
    setRestoring(false);
    if (result.ok) {
      setPending(undefined);
      await props.onRestored();
      return;
    }
    setFailure(result.error);
    await settleFailure(item, result.error);
  }
  /** 用于按失败类别刷新列表事实并仅在对象已恢复时关闭。 */
  async function settleFailure(item: TrashItem, error: RestoreFailure): Promise<void> {
    const shouldResync =
      error.certainty === 'unknown' ||
      error.code === 'KNOWLEDGE_BASE_DELETED' ||
      error.code === 'VERSION_CONFLICT' ||
      error.code === 'CONFLICT';
    if (!shouldResync) return;
    const fresh = await props.onRestored();
    if (fresh && !fresh.some((entry) => entry.id === item.id)) setPending(undefined);
  }
  return { close, confirm, failure, open, pending, restoring };
}

/** 用于渲染列表内容并局部处理分页失败。 */
function TrashListContent(props: {
  desktop: boolean;
  items: readonly TrashItem[];
  load: TrashLoadState;
  offline: boolean;
  onLoadMore: () => void;
  onRestore: (item: TrashItem) => void;
  onRetry: () => void;
}) {
  const { desktop, items, load, offline, onLoadMore, onRestore, onRetry } = props;
  if (load.loading && items.length === 0) return <TrashSkeleton />;
  if (load.error && items.length === 0) {
    return <LoadFailure description={load.error.message} onRetry={onRetry} title="回收站未加载" />;
  }
  if (items.length === 0) return <TrashEmptyState />;
  const blockedKnowledgeBaseIds = collectBlockedKnowledgeBaseIds(items);
  return (
    <>
      <ul className="m-0 grid list-none divide-y divide-border p-0">
        {items.map((item) => (
          <TrashItemRow
            blockedKnowledgeBaseIds={blockedKnowledgeBaseIds}
            desktop={desktop}
            item={item}
            key={item.id}
            offline={offline}
            onRestore={onRestore}
          />
        ))}
      </ul>
      {load.error && (
        <LoadFailure description={load.error.message} onRetry={onRetry} title="回收站条目未加载" />
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

/** 用于组合回收站列表与恢复确认流程。 */
export function TrashItemList(props: {
  desktop: boolean;
  items: readonly TrashItem[];
  load: TrashLoadState;
  offline: boolean;
  onLoadMore: () => void;
  onRestored: () => Promise<readonly TrashItem[] | undefined>;
  onRetry: () => void;
}) {
  const restore = useTrashRestore({ onRestored: props.onRestored });
  return (
    <>
      <TrashListContent
        desktop={props.desktop}
        items={props.items}
        load={props.load}
        offline={props.offline}
        onLoadMore={props.onLoadMore}
        onRestore={restore.open}
        onRetry={props.onRetry}
      />
      {restore.pending && (
        <TrashRestoreDialog
          {...(restore.failure ? { failure: restore.failure } : {})}
          item={restore.pending.item}
          offline={props.offline}
          onClose={restore.close}
          onConfirm={() => void restore.confirm()}
          restoring={restore.restoring}
        />
      )}
    </>
  );
}
