/** @fileoverview 渲染按需加载的知识库文档树与创建重命名入口。 */

'use client';

import type { DocumentDetail, DocumentTreeItem } from '@everlearn/contracts';
import {
  ChevronRightIcon,
  FileTextIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
} from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
} from '@everlearn/ui';

import { EmptyState } from '../../shared/empty-state';
import { LoadFailure } from '../../shared/load-failure';
import { CreateDocumentDialog, RenameDocumentDialog } from './document-tree-dialogs';
import { useDocumentTree } from './document-tree-state';
import type { DocumentChildList } from './document-tree-state';

/** 用于向递归节点传递树读取与操作能力。 */
interface TreeBindings {
  readonly childList: (parentId?: string | null) => DocumentChildList;
  readonly desktop: boolean;
  readonly isExpanded: (id: string) => boolean;
  readonly loadMore: (parentId?: string | null) => void;
  readonly onCreateChild: (parent: DocumentTreeItem) => void;
  readonly onRename: (item: DocumentTreeItem) => void;
  readonly retry: (parentId?: string | null) => void;
  readonly toggle: (item: DocumentTreeItem) => void;
}

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
function ChildrenPending(props: { label?: string; list: DocumentChildList; onRetry: () => void }) {
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

/** 用于渲染一个父节点下子区域的加载、失败、空与列表状态。 */
function ChildrenArea(props: {
  emptyContent: ReactNode;
  indented: boolean;
  list: DocumentChildList;
  parentId?: string;
  tree: TreeBindings;
}) {
  const { emptyContent, indented, list, parentId, tree } = props;
  return (
    <div className={indented ? 'ml-4 border-l border-border pl-2' : undefined}>
      <ChildrenPending list={list} onRetry={() => tree.retry(parentId)} />
      {list.loaded && list.items.length === 0 ? emptyContent : null}
      {list.items.length > 0 ? <DocumentNodeList items={list.items} tree={tree} /> : null}
      <ChildrenTail
        list={list}
        onLoadMore={() => tree.loadMore(parentId)}
        onRetry={() => tree.retry(parentId)}
      />
    </div>
  );
}

/** 用于渲染一层兄弟节点列表。 */
function DocumentNodeList(props: { items: readonly DocumentTreeItem[]; tree: TreeBindings }) {
  return (
    <ul className="m-0 grid list-none gap-0.5 p-0">
      {props.items.map((item) => (
        <DocumentNodeRow item={item} key={item.id} tree={props.tree} />
      ))}
    </ul>
  );
}

/** 用于渲染节点行的桌面操作菜单。 */
function DocumentRowMenu(props: {
  item: DocumentTreeItem;
  onCreateChild: (parent: DocumentTreeItem) => void;
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
        {/* 打开正文依赖 ED-05 文档页面，本任务保持不可用态。 */}
        <DropdownMenuItem disabled>打开文档</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => props.onCreateChild(props.item)}>
          <PlusIcon aria-hidden="true" size={16} />
          新建子文档
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => props.onRename(props.item)}>
          <PencilIcon aria-hidden="true" size={16} />
          重命名
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 用于渲染单个树节点行与其展开入口。 */
function DocumentNodeRow(props: { item: DocumentTreeItem; tree: TreeBindings }) {
  const { item, tree } = props;
  const expanded = tree.isExpanded(item.id);
  return (
    <li>
      <div className="group/row flex min-w-0 items-center gap-1 rounded-md py-1 pr-1 hover:bg-accent">
        {item.childCount > 0 ? (
          <Button
            aria-expanded={expanded}
            aria-label={`${expanded ? '折叠' : '展开'}“${item.title}”`}
            onClick={() => tree.toggle(item)}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <ChevronRightIcon aria-hidden="true" className={expanded ? 'rotate-90' : undefined} />
          </Button>
        ) : (
          <span aria-hidden="true" className="size-6 shrink-0" />
        )}
        <FileTextIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground" title={item.title}>
          {item.title}
        </span>
        {tree.desktop && (
          <DocumentRowMenu
            item={item}
            onCreateChild={tree.onCreateChild}
            onRename={tree.onRename}
          />
        )}
      </div>
      {expanded && (
        <ChildrenArea
          emptyContent={<p className="m-0 py-1 text-sm text-muted-foreground">没有子文档。</p>}
          indented
          list={tree.childList(item.id)}
          parentId={item.id}
          tree={tree}
        />
      )}
    </li>
  );
}

/** 用于渲染空知识库的首篇文档创建入口。 */
function TreeEmptyState(props: { desktop: boolean; offline: boolean; onCreate: () => void }) {
  return (
    <EmptyState
      action={
        props.desktop && (
          <Button disabled={props.offline} onClick={props.onCreate} type="button">
            <PlusIcon aria-hidden="true" />
            新建首篇文档
          </Button>
        )
      }
      description="这个知识库还没有文档，从第一篇开始逐步建立层级。"
      icon={FileTextIcon}
      title="还没有文档"
    />
  );
}

/** 用于渲染文档区标题与桌面新建入口。 */
function TreeHeader(props: { desktop: boolean; offline: boolean; onCreate: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="m-0 text-title-small text-foreground" id="knowledge-documents-title">
        文档
      </h2>
      {props.desktop && (
        <Button
          disabled={props.offline}
          onClick={props.onCreate}
          size="sm"
          type="button"
          variant="outline"
        >
          <PlusIcon aria-hidden="true" />
          新建文档
        </Button>
      )}
    </div>
  );
}

/** 用于渲染根级文档区域的加载、失败与空状态分支。 */
function RootArea(props: {
  desktop: boolean;
  list: DocumentChildList;
  offline: boolean;
  tree: TreeBindings;
  onCreate: () => void;
}) {
  const { desktop, list, offline, onCreate, tree } = props;
  return (
    <>
      <ChildrenPending label="正在加载文档树" list={list} onRetry={() => tree.retry()} />
      {list.loaded ? (
        <ChildrenArea
          emptyContent={<TreeEmptyState desktop={desktop} offline={offline} onCreate={onCreate} />}
          indented={false}
          list={list}
          tree={tree}
        />
      ) : null}
    </>
  );
}

/** 用于渲染当前目标的创建与重命名对话框。 */
function TreeDialogs(props: {
  createTarget: { parent?: DocumentTreeItem } | undefined;
  knowledgeBaseId: string;
  offline: boolean;
  renameTarget: DocumentTreeItem | undefined;
  onApplyCreated: (detail: DocumentDetail) => void;
  onApplyDetail: (detail: DocumentDetail) => void;
  onCloseCreate: () => void;
  onCloseRename: () => void;
  onUncertain: (parentId?: string) => void;
}) {
  const { createTarget } = props;
  return (
    <>
      {createTarget && (
        <CreateDocumentDialog
          knowledgeBaseId={props.knowledgeBaseId}
          offline={props.offline}
          opened
          onClose={props.onCloseCreate}
          onCreated={props.onApplyCreated}
          onUncertain={() => props.onUncertain(createTarget.parent?.id)}
          {...(createTarget.parent
            ? { parentId: createTarget.parent.id, parentTitle: createTarget.parent.title }
            : {})}
        />
      )}
      {props.renameTarget && (
        <RenameDocumentDialog
          item={props.renameTarget}
          offline={props.offline}
          opened
          onClose={props.onCloseRename}
          onDetailAccepted={props.onApplyDetail}
        />
      )}
    </>
  );
}

/** 用于组装传给递归节点的树操作绑定。 */
function createTreeBindings(props: {
  desktop: boolean;
  setCreateTarget: (target: { parent?: DocumentTreeItem } | undefined) => void;
  setRenameTarget: (target: DocumentTreeItem | undefined) => void;
  tree: ReturnType<typeof useDocumentTree>;
}): TreeBindings {
  const { desktop, setCreateTarget, setRenameTarget, tree } = props;
  return {
    childList: tree.childList,
    desktop,
    isExpanded: tree.isExpanded,
    loadMore: tree.loadMore,
    /** 用于把行菜单的子文档意图交给创建对话框。 */
    onCreateChild: (parent) => setCreateTarget({ parent }),
    onRename: setRenameTarget,
    retry: tree.retry,
    toggle: tree.toggle,
  };
}

/** 用于渲染按需加载的文档树和创建重命名流程。 */
export function DocumentTree(props: {
  desktop: boolean;
  knowledgeBaseId: string;
  offline: boolean;
  onCreated: () => void;
  onUncertainOutcome?: () => void;
}) {
  const { desktop, knowledgeBaseId, offline, onCreated, onUncertainOutcome } = props;
  const tree = useDocumentTree(knowledgeBaseId);
  const [createTarget, setCreateTarget] = useState<{ parent?: DocumentTreeItem }>();
  const [renameTarget, setRenameTarget] = useState<DocumentTreeItem>();
  const bindings = createTreeBindings({ desktop, setCreateTarget, setRenameTarget, tree });
  /** 用于把创建结果并入树并同步页面统计。 */
  function handleCreated(detail: DocumentDetail): void {
    tree.applyCreated(detail);
    onCreated();
  }
  return (
    <section aria-labelledby="knowledge-documents-title" className="grid gap-2 pt-2">
      <TreeHeader desktop={desktop} offline={offline} onCreate={() => setCreateTarget({})} />
      <RootArea
        desktop={desktop}
        list={tree.childList()}
        offline={offline}
        onCreate={() => setCreateTarget({})}
        tree={bindings}
      />
      <p className="m-0 text-caption text-muted-foreground">打开文档正文将在编辑器上线后提供。</p>
      <TreeDialogs
        createTarget={createTarget}
        knowledgeBaseId={knowledgeBaseId}
        offline={offline}
        renameTarget={renameTarget}
        onApplyCreated={handleCreated}
        onApplyDetail={(detail) => tree.applyDetail(detail)}
        onCloseCreate={() => setCreateTarget(undefined)}
        onCloseRename={() => setRenameTarget(undefined)}
        onUncertain={(parentId) => {
          tree.retry(parentId);
          onUncertainOutcome?.();
        }}
      />
    </section>
  );
}
