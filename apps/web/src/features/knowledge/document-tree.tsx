/** @fileoverview 组装文档树区：头部、根区域、对话框与移动交互入口。 */

'use client';

import type { DocumentDetail, DocumentTreeItem } from '@everlearn/contracts';
import { FileTextIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@everlearn/ui';

import { EmptyState } from '../../shared/empty-state';
import { MoveFailureNotice, useTreeMoveInteraction } from './document-tree-drag';
import { CreateDocumentDialog, RenameDocumentDialog } from './document-tree-dialogs';
import { MoveDocumentDialog } from './document-tree-move-dialog';
import { ChildrenArea, ChildrenPending } from './document-tree-rows';
import { useDocumentTree } from './document-tree-state';
import type { TreeBindings, TreeDragController } from './document-tree-bindings';
import type {
  DocumentChildList,
  MoveFailureInfo,
  MoveOutcome,
  MoveParentOption,
  MovePlacement,
} from './document-tree-model';

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

/** 用于渲染根级文档区域的加载、失败与空状态分支并承接顶层放置。 */
function RootArea(props: {
  desktop: boolean;
  list: DocumentChildList;
  offline: boolean;
  tree: TreeBindings;
  onCreate: () => void;
}) {
  const { desktop, list, offline, onCreate, tree } = props;
  return (
    <div {...tree.drag.rootDropProps}>
      <ChildrenPending label="正在加载文档树" list={list} onRetry={() => tree.retry()} />
      {list.loaded ? (
        <ChildrenArea
          emptyContent={<TreeEmptyState desktop={desktop} offline={offline} onCreate={onCreate} />}
          indented={false}
          list={list}
          tree={tree}
        />
      ) : null}
    </div>
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

/** 用于渲染移动失败提示并在可重试时复用上次放置。 */
function MoveFailureArea(props: {
  failure: MoveFailureInfo | undefined;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  if (!props.failure) return null;
  return (
    <MoveFailureNotice
      failure={props.failure}
      onDismiss={props.onDismiss}
      onRetry={props.onRetry}
    />
  );
}

/** 用于在存在移动目标时挂载键盘移动对话框。 */
function MoveDialogArea(props: {
  childListOf: (parentId?: string | null) => DocumentChildList;
  item: DocumentTreeItem | undefined;
  offline: boolean;
  parentOf: (id: string) => string | null;
  optionsOf: (id: string) => readonly MoveParentOption[];
  move: (id: string, placement: MovePlacement) => Promise<MoveOutcome>;
  onClose: () => void;
}) {
  const { item } = props;
  if (!item) return null;
  return (
    <MoveDocumentDialog
      childListOf={props.childListOf}
      currentParentId={props.parentOf(item.id)}
      item={item}
      offline={props.offline}
      onClose={props.onClose}
      onMove={(placement) => props.move(item.id, placement)}
      opened
      options={props.optionsOf(item.id)}
    />
  );
}

/** 用于组装传给递归节点的树操作绑定。 */
function createTreeBindings(props: {
  activeDocumentId: string | undefined;
  desktop: boolean;
  drag: TreeDragController;
  knowledgeBaseId: string;
  setCreateTarget: (target: { parent?: DocumentTreeItem } | undefined) => void;
  setMoveTarget: (target: DocumentTreeItem | undefined) => void;
  setRenameTarget: (target: DocumentTreeItem | undefined) => void;
  tree: ReturnType<typeof useDocumentTree>;
}): TreeBindings {
  const { desktop, drag, setCreateTarget, setMoveTarget, setRenameTarget, tree } = props;
  return {
    ...(props.activeDocumentId ? { activeDocumentId: props.activeDocumentId } : {}),
    childList: tree.childList,
    desktop,
    drag,
    isExpanded: tree.isExpanded,
    knowledgeBaseId: props.knowledgeBaseId,
    loadMore: tree.loadMore,
    /** 用于把行菜单的子文档意图交给创建对话框。 */
    onCreateChild: (parent) => setCreateTarget({ parent }),
    /** 用于把行菜单的移动意图交给移动对话框。 */
    onMove: setMoveTarget,
    onRename: setRenameTarget,
    retry: tree.retry,
    toggle: tree.toggle,
  };
}

/** 用于渲染树区主体：头部、移动失败提示与根区域。 */
function TreeBody(props: {
  desktop: boolean;
  list: DocumentChildList;
  moves: ReturnType<typeof useTreeMoveInteraction>;
  offline: boolean;
  tree: TreeBindings;
  onCreate: () => void;
}) {
  const { moves } = props;
  return (
    <>
      <TreeHeader desktop={props.desktop} offline={props.offline} onCreate={props.onCreate} />
      <MoveFailureArea failure={moves.failure} onDismiss={moves.dismiss} onRetry={moves.retry} />
      <RootArea
        desktop={props.desktop}
        list={props.list}
        offline={props.offline}
        onCreate={props.onCreate}
        tree={props.tree}
      />
    </>
  );
}

/** 用于挂载当前打开的创建、重命名与移动对话框。 */
function TreeDialogLayer(props: {
  createTarget: { parent?: DocumentTreeItem } | undefined;
  knowledgeBaseId: string;
  moveTarget: DocumentTreeItem | undefined;
  offline: boolean;
  renameTarget: DocumentTreeItem | undefined;
  tree: ReturnType<typeof useDocumentTree>;
  forgetMoveIntent: () => void;
  onApplyCreated: (detail: DocumentDetail) => void;
  onCloseCreate: () => void;
  onCloseMove: () => void;
  onCloseRename: () => void;
  onUncertain: (parentId?: string) => void;
}) {
  const { tree } = props;
  return (
    <>
      <TreeDialogs
        createTarget={props.createTarget}
        knowledgeBaseId={props.knowledgeBaseId}
        offline={props.offline}
        renameTarget={props.renameTarget}
        onApplyCreated={props.onApplyCreated}
        onApplyDetail={(detail) => tree.applyDetail(detail)}
        onCloseCreate={props.onCloseCreate}
        onCloseRename={props.onCloseRename}
        onUncertain={props.onUncertain}
      />
      <MoveDialogArea
        childListOf={tree.childList}
        item={props.moveTarget}
        offline={props.offline}
        parentOf={tree.parentIdOf}
        optionsOf={tree.moveOptionsFor}
        move={(draggedId, placement) => {
          props.forgetMoveIntent();
          return tree.move(draggedId, placement);
        }}
        onClose={props.onCloseMove}
      />
    </>
  );
}

/** 用于持有树状态、对话框目标与移动交互的组合状态。 */
function useTreeSection(props: {
  activeDocumentId: string | undefined;
  desktop: boolean;
  knowledgeBaseId: string;
  offline: boolean;
}) {
  const tree = useDocumentTree(props.knowledgeBaseId);
  const [createTarget, setCreateTarget] = useState<{ parent?: DocumentTreeItem }>();
  const [renameTarget, setRenameTarget] = useState<DocumentTreeItem>();
  const [moveTarget, setMoveTarget] = useState<DocumentTreeItem>();
  const moves = useTreeMoveInteraction({
    enabled: props.desktop && !props.offline,
    isInvalidTarget: tree.isInvalidMoveTarget,
    move: tree.move,
  });
  const bindings = createTreeBindings({
    activeDocumentId: props.activeDocumentId,
    desktop: props.desktop,
    drag: moves.drag,
    knowledgeBaseId: props.knowledgeBaseId,
    setCreateTarget,
    setMoveTarget,
    setRenameTarget,
    tree,
  });
  /** 用于关闭全部对话框目标。 */
  function closeDialogs(): void {
    setCreateTarget(undefined);
    setRenameTarget(undefined);
    setMoveTarget(undefined);
  }
  /** 用于打开根级文档创建对话框。 */
  function openRootCreate(): void {
    setCreateTarget({});
  }
  return {
    bindings,
    closeDialogs,
    createTarget,
    moveTarget,
    moves,
    openRootCreate,
    renameTarget,
    tree,
  };
}

/** 用于渲染按需加载的文档树和创建、重命名、移动流程。 */
export function DocumentTree(props: {
  /** 当前打开的文档 id，行高亮与当前位置标识。 */
  activeDocumentId?: string;
  desktop: boolean;
  knowledgeBaseId: string;
  offline: boolean;
  onCreated: () => void;
  onUncertainOutcome?: () => void;
}) {
  const { desktop, knowledgeBaseId, offline, onCreated, onUncertainOutcome, activeDocumentId } =
    props;
  const section = useTreeSection({ activeDocumentId, desktop, knowledgeBaseId, offline });
  const { tree } = section;
  /** 用于把创建结果并入树并同步页面统计。 */
  function handleCreated(detail: DocumentDetail): void {
    tree.applyCreated(detail);
    onCreated();
  }
  return (
    <section aria-labelledby="knowledge-documents-title" className="grid gap-2 pt-2">
      <TreeBody
        desktop={desktop}
        list={tree.childList()}
        moves={section.moves}
        offline={offline}
        tree={section.bindings}
        onCreate={section.openRootCreate}
      />
      <TreeDialogLayer
        createTarget={section.createTarget}
        forgetMoveIntent={section.moves.forget}
        knowledgeBaseId={knowledgeBaseId}
        moveTarget={section.moveTarget}
        offline={offline}
        renameTarget={section.renameTarget}
        tree={tree}
        onApplyCreated={handleCreated}
        onCloseCreate={section.closeDialogs}
        onCloseMove={section.closeDialogs}
        onCloseRename={section.closeDialogs}
        onUncertain={(parentId) => {
          tree.retry(parentId);
          onUncertainOutcome?.();
        }}
      />
    </section>
  );
}
