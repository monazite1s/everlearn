/** @fileoverview 定义递归树行渲染与拖拽控制的共享绑定类型。 */

import type { DocumentTreeItem } from '@everlearn/contracts';
import type { DragEvent } from 'react';

import type { DocumentChildList } from './document-tree-model';

/** 用于向递归节点传递树读取、操作与拖拽能力。 */
export interface TreeBindings {
  readonly childList: (parentId?: string | null) => DocumentChildList;
  readonly desktop: boolean;
  readonly drag: TreeDragController;
  readonly isExpanded: (id: string) => boolean;
  readonly loadMore: (parentId?: string | null) => void;
  readonly onCreateChild: (parent: DocumentTreeItem) => void;
  readonly onMove: (item: DocumentTreeItem) => void;
  readonly onRename: (item: DocumentTreeItem) => void;
  readonly retry: (parentId?: string | null) => void;
  readonly toggle: (item: DocumentTreeItem) => void;
}

/** 用于描述单行可展开的拖拽事件属性。 */
export interface RowDragProps {
  readonly draggable?: boolean;
  readonly onDragEnd?: (event: DragEvent<HTMLElement>) => void;
  readonly onDragOver?: (event: DragEvent<HTMLElement>) => void;
  readonly onDragStart?: (event: DragEvent<HTMLElement>) => void;
  readonly onDrop?: (event: DragEvent<HTMLElement>) => void;
}

/** 用于按行分发拖拽事件并查询放置反馈。 */
export interface TreeDragController {
  readonly classNameFor: (id: string) => string | undefined;
  readonly lineFor: (id: string) => 'top' | 'bottom' | undefined;
  readonly propsFor: (item: DocumentTreeItem, parentId: string | null) => RowDragProps;
  readonly rootDropProps: RowDragProps;
}
