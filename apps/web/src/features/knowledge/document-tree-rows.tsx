/** @fileoverview 渲染文档树节点行、子区域状态、行菜单与拖拽放置反馈。 */

'use client';

import type { DocumentTreeItem } from '@everlearn/contracts';
import {
  ChevronRightIcon,
  FolderInputIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import Link from 'next/link';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
  cn,
} from '@everlearn/ui';

import { LoadFailure } from '../../shared/load-failure';
import type { TreeBindings } from './document-tree-bindings';
import type { DocumentChildList } from './document-tree-model';

/** 用于渲染子节点读取期间的布局稳定骨架。 */
function ChildrenLoading({ label }: { label: string }) {
  return (
    <div aria-label={label} className="grid gap-2 py-1" role="status">
      <Skeleton className="h-7" />
      <Skeleton className="h-7 w-5/6" />
    </div>
  );
}

/** 用于渲染子区域失败并支持就地重试。 */
function ChildrenFailure(props: { error: string; onRetry: () => void }) {
  return <LoadFailure description={props.error} onRetry={props.onRetry} title="子文档未加载" />;
}

/** 用于渲染按游标继续读取的入口。 */
function LoadMoreButton(props: { loading: boolean; onLoadMore: () => void }) {
  return (
    <Button
      className="mt-1"
      disabled={props.loading}
      onClick={props.onLoadMore}
      size="xs"
      type="button"
      variant="ghost"
    >
      {props.loading && <Loader2Icon aria-hidden="true" className="animate-spin" />}
      加载更多
    </Button>
  );
}

/** 用于渲染未完成首屏读取时的骨架或失败提示。 */
export function ChildrenPending(props: {
  label?: string;
  list: DocumentChildList;
  onRetry: () => void;
}) {
  const { label, list, onRetry } = props;
  if (list.loading && !list.loaded) return <ChildrenLoading label={label ?? '正在加载子文档'} />;
  if (list.error && !list.loaded) {
    return <ChildrenFailure error={list.error.message} onRetry={onRetry} />;
  }
  return null;
}

/** 用于渲染已加载列表的追加失败与继续加载入口。 */
function ChildrenTail(props: {
  list: DocumentChildList;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  const { list, onLoadMore, onRetry } = props;
  if (!list.loaded) return null;
  if (list.error) return <ChildrenFailure error={list.error.message} onRetry={onRetry} />;
  if (list.nextCursor) return <LoadMoreButton loading={list.loading} onLoadMore={onLoadMore} />;
  return null;
}

/** 用于吞掉嵌套子区域空白处的放置，避免冒泡到根容器误执行顶层移动。 */
const nestedDropGuard = {
  /** 用于阻止嵌套空白区启用根级放置。 */
  onDragOver: (event: React.DragEvent<HTMLDivElement>): void => event.stopPropagation(),
  /** 用于阻止嵌套空白区的放置冒泡为顶层移动。 */
  onDrop: (event: React.DragEvent<HTMLDivElement>): void => event.stopPropagation(),
} as const;

/** 用于渲染一个父节点下子区域的加载、失败、空与列表状态。 */
export function ChildrenArea(props: {
  emptyContent: ReactNode;
  indented: boolean;
  list: DocumentChildList;
  parentId?: string;
  tree: TreeBindings;
}) {
  const { emptyContent, indented, list, parentId, tree } = props;
  return (
    <div
      className={indented ? 'ml-3 border-l border-border' : undefined}
      {...(indented ? nestedDropGuard : {})}
    >
      <ChildrenPending list={list} onRetry={() => tree.retry(parentId)} />
      {list.loaded && list.items.length === 0 ? emptyContent : null}
      {list.items.length > 0 ? (
        <DocumentNodeList items={list.items} parentId={parentId ?? null} tree={tree} />
      ) : null}
      <ChildrenTail
        list={list}
        onLoadMore={() => tree.loadMore(parentId)}
        onRetry={() => tree.retry(parentId)}
      />
    </div>
  );
}

/** 用于渲染节点行的桌面操作菜单。 */
function DocumentRowMenu(props: {
  readonly item: DocumentTreeItem;
  onCreateChild: (parent: DocumentTreeItem) => void;
  onMove: (item: DocumentTreeItem) => void;
  onRename: (item: DocumentTreeItem) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`“${props.item.title}”的文档操作`}
          className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <MoreHorizontalIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => props.onCreateChild(props.item)}>
          <PlusIcon aria-hidden="true" size={16} />
          新建子文档
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => props.onRename(props.item)}>
          <PencilIcon aria-hidden="true" size={16} />
          重命名
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => props.onMove(props.item)}>
          <FolderInputIcon aria-hidden="true" size={16} />
          移动到…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 用于渲染放置指示线以表达相邻插入位置。 */
function DropIndicator({ edge }: { edge: 'top' | 'bottom' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'absolute inset-x-1 h-0.5 rounded-full bg-primary',
        edge === 'top' ? 'top-0' : 'bottom-0',
      )}
    />
  );
}

/** 用于渲染节点展开入口或在无子节点时保持占位。 */
function RowToggleButton(props: {
  expanded: boolean;
  item: DocumentTreeItem;
  onToggle: (item: DocumentTreeItem) => void;
}) {
  if (props.item.childCount === 0) {
    return <span aria-hidden="true" className="size-6 shrink-0" />;
  }
  const expanded = props.expanded;
  return (
    <Button
      aria-expanded={expanded}
      aria-label={`${expanded ? '折叠' : '展开'}“${props.item.title}”`}
      onClick={() => props.onToggle(props.item)}
      size="icon-xs"
      type="button"
      variant="ghost"
    >
      <ChevronRightIcon aria-hidden="true" className={expanded ? 'rotate-90' : undefined} />
    </Button>
  );
}

/** 用于渲染展开节点的子区域状态。 */
function ExpandedChildren(props: { item: DocumentTreeItem; tree: TreeBindings }) {
  return (
    <ChildrenArea
      emptyContent={<p className="m-0 py-1 text-sm text-muted-foreground">没有子文档。</p>}
      indented
      list={props.tree.childList(props.item.id)}
      parentId={props.item.id}
      tree={props.tree}
    />
  );
}

/** 用于渲染一层兄弟节点列表。 */
function DocumentNodeList(props: {
  items: readonly DocumentTreeItem[];
  parentId: string | null;
  tree: TreeBindings;
}) {
  return (
    <ul className="m-0 grid list-none gap-0.5 p-0 grid-cols-[minmax(0,1fr)]">
      {props.items.map((item) => (
        <DocumentNodeRow item={item} key={item.id} parentId={props.parentId} tree={props.tree} />
      ))}
    </ul>
  );
}

/** 用于渲染单个树节点行、当前位置高亮、拖拽反馈与其展开子区域。 */
function DocumentNodeRow(props: {
  item: DocumentTreeItem;
  parentId: string | null;
  tree: TreeBindings;
}) {
  const { item, tree } = props;
  const expanded = tree.isExpanded(item.id);
  const edge = tree.drag.lineFor(item.id);
  const active = tree.activeDocumentId === item.id;
  const openHref = `/knowledge/${tree.knowledgeBaseId}/documents/${item.id}`;
  return (
    <li>
      <div
        className={cn(
          'group/row relative flex min-w-0 items-center gap-1 rounded-md py-1 pr-1 hover:bg-accent',
          active && 'bg-accent',
          tree.drag.classNameFor(item.id),
        )}
        {...tree.drag.propsFor(item, props.parentId)}
      >
        {edge ? <DropIndicator edge={edge} /> : null}
        {active ? (
          <span
            aria-hidden="true"
            className="absolute inset-y-0.5 left-0 w-0.5 rounded-full bg-primary"
          />
        ) : null}
        <RowToggleButton expanded={expanded} item={item} onToggle={tree.toggle} />
        <Link
          aria-current={active ? 'page' : undefined}
          className={cn('min-w-0 flex-1 truncate text-sm text-foreground', active && 'font-medium')}
          href={openHref}
          title={item.title}
        >
          {item.title}
        </Link>
        {tree.desktop && (
          <DocumentRowMenu
            item={item}
            onCreateChild={tree.onCreateChild}
            onMove={tree.onMove}
            onRename={tree.onRename}
          />
        )}
      </div>
      {expanded ? <ExpandedChildren item={item} tree={tree} /> : null}
    </li>
  );
}
