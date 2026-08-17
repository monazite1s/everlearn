/** @fileoverview 提供文档树原生拖拽控制与移动失败提示。 */

'use client';

import { AlertCircleIcon } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { Alert, AlertDescription, AlertTitle, Button } from '@everlearn/ui';

import type {
  DropIntent,
  MoveFailureInfo,
  MoveOutcome,
  MovePlacement,
} from './document-tree-model';
import type { RowDragProps, TreeDragController } from './document-tree-bindings';

interface DragFeedback {
  readonly draggedId?: string;
  readonly intent?: DropIntent;
  readonly overId?: string;
}

interface DragTargetRow {
  readonly id: string;
  readonly parentId: string | null;
}

/** 用于按指针在行内的纵向位置推导放置意图。 */
function intentFrom(event: { clientY: number; currentTarget: Element }): DropIntent {
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
  if (ratio < 0.3) return 'before';
  if (ratio > 0.7) return 'after';
  return 'into';
}

/** 用于把目标行与意图换算为最终放置意图。 */
function placementOf(row: DragTargetRow, intent: DropIntent): MovePlacement {
  if (intent === 'into') return { intent, targetParentId: row.id };
  return { anchorId: row.id, intent, targetParentId: row.parentId };
}

/** 用于构造单行拖拽事件处理器并在无效目标上保持不可放。 */
function rowHandlers(args: {
  feedback: DragFeedback;
  isInvalidTarget: (draggedId: string, targetId: string) => boolean;
  onDragStart: () => void;
  onDropPlacement: (draggedId: string, placement: MovePlacement) => void;
  onOver: (overId: string, intent: DropIntent) => void;
  reset: () => void;
  row: DragTargetRow;
}): Pick<RowDragProps, 'onDragEnd' | 'onDragOver' | 'onDragStart' | 'onDrop'> {
  const targetId = args.row.id;
  return {
    onDragEnd: args.reset,
    /** 用于登记拖拽开始并写入来源标识。 */
    onDragStart: (event) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', targetId);
      args.onDragStart();
    },
    /** 用于在有效目标上声明可放并登记意图。 */
    onDragOver: (event) => {
      event.stopPropagation();
      const draggedId = args.feedback.draggedId;
      if (draggedId === undefined || args.isInvalidTarget(draggedId, targetId)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      args.onOver(targetId, intentFrom(event));
    },
    /** 用于在放置时换算意图并交给移动编排。 */
    onDrop: (event) => {
      event.preventDefault();
      event.stopPropagation();
      const draggedId = args.feedback.draggedId;
      const intent = intentFrom(event);
      args.reset();
      if (draggedId === undefined || args.isInvalidTarget(draggedId, targetId)) return;
      args.onDropPlacement(draggedId, placementOf(args.row, intent));
    },
  };
}

/** 用于构造根区域空白处移动到顶层末尾的放置处理。 */
function rootDropController(args: {
  draggedId: string | undefined;
  onDropPlacement: (draggedId: string, placement: MovePlacement) => void;
  reset: () => void;
}): RowDragProps {
  return {
    /** 用于在拖拽经过根空白时声明可放。 */
    onDragOver: (event) => {
      if (args.draggedId === undefined) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    },
    /** 用于在根空白处放置时移动到顶层末尾。 */
    onDrop: (event) => {
      event.preventDefault();
      const draggedId = args.draggedId;
      args.reset();
      if (draggedId !== undefined) {
        args.onDropPlacement(draggedId, { intent: 'into', targetParentId: null });
      }
    },
  };
}

/** 用于按反馈状态计算来源行与移入目标的视觉类。 */
function rowClassNameFor(feedback: DragFeedback, id: string): string | undefined {
  if (feedback.draggedId === id) return 'opacity-50';
  if (feedback.overId === id && feedback.intent === 'into') return 'bg-primary/10';
  return undefined;
}

/** 用于按反馈状态计算放置指示线方位。 */
function dropLineFor(feedback: DragFeedback, id: string): 'top' | 'bottom' | undefined {
  if (feedback.overId !== id || feedback.draggedId === undefined) return undefined;
  if (feedback.intent === 'before') return 'top';
  if (feedback.intent === 'after') return 'bottom';
  return undefined;
}

/** 用于按行分发原生拖拽事件并维护放置反馈。 */
export function useTreeDrag(props: {
  readonly enabled: boolean;
  readonly isInvalidTarget: (draggedId: string, targetId: string) => boolean;
  readonly onDropPlacement: (draggedId: string, placement: MovePlacement) => void;
}): TreeDragController {
  const [feedback, setFeedback] = useState<DragFeedback>({});
  const clear = useCallback(() => setFeedback({}), []);
  /** 用于登记拖拽来源行。 */
  function markDragged(draggedId: string): void {
    setFeedback({ draggedId });
  }
  /** 用于登记有效目标的放置意图。 */
  function markOver(overId: string, intent: DropIntent): void {
    setFeedback((current) => ({ ...current, intent, overId }));
  }
  /** 用于构造一行的拖拽属性集，未启用时保持只读。 */
  function propsFor(item: { id: string }, parentId: string | null): RowDragProps {
    if (!props.enabled) return {};
    const row: DragTargetRow = { id: item.id, parentId };
    return {
      draggable: true,
      ...rowHandlers({
        feedback,
        isInvalidTarget: props.isInvalidTarget,
        onDropPlacement: props.onDropPlacement,
        /** 用于登记本行拖拽开始。 */
        onDragStart: () => markDragged(item.id),
        onOver: markOver,
        reset: clear,
        row,
      }),
    };
  }
  const rootDropProps = props.enabled
    ? rootDropController({
        draggedId: feedback.draggedId,
        onDropPlacement: props.onDropPlacement,
        reset: clear,
      })
    : {};
  return {
    /** 用于查询行级视觉反馈类。 */
    classNameFor: (id: string) => rowClassNameFor(feedback, id),
    /** 用于查询放置指示线方位。 */
    lineFor: (id: string) => dropLineFor(feedback, id),
    propsFor,
    rootDropProps,
  };
}

/** 用于渲染拖拽移动失败后的可行动提示与重试入口。 */
export function MoveFailureNotice(props: {
  failure: MoveFailureInfo;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>移动失败</AlertTitle>
      <AlertDescription>
        <p className="m-0">{props.failure.message}</p>
        <div className="mt-2 flex gap-2">
          {props.failure.retryable && (
            <Button onClick={props.onRetry} size="sm" type="button" variant="outline">
              重试移动
            </Button>
          )}
          <Button onClick={props.onDismiss} size="sm" type="button" variant="ghost">
            关闭
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

/** 用于编排拖拽放置、失败提示与同幂等键重试。 */
export function useTreeMoveInteraction(props: {
  enabled: boolean;
  isInvalidTarget: (draggedId: string, targetId: string) => boolean;
  move: (draggedId: string, placement: MovePlacement) => Promise<MoveOutcome>;
}) {
  const [failure, setFailure] = useState<MoveFailureInfo>();
  const lastDropRef = useRef<{ draggedId: string; placement: MovePlacement } | undefined>(
    undefined,
  );
  /** 用于把放置意图交给移动编排并在失败时给出可行动提示。 */
  function handleDrop(draggedId: string, placement: MovePlacement): void {
    lastDropRef.current = { draggedId, placement };
    setFailure(undefined);
    void props.move(draggedId, placement).then((outcome) => {
      if (!outcome.ok) setFailure(outcome.failure);
    });
  }
  /** 用于按上次放置重试移动并复用同一幂等键。 */
  function retry(): void {
    const last = lastDropRef.current;
    if (last) handleDrop(last.draggedId, last.placement);
  }
  /** 用于关闭失败提示。 */
  function dismiss(): void {
    setFailure(undefined);
  }
  /** 用于在换用对话框等其他入口移动时丢弃过期的拖拽重试意图。 */
  function forget(): void {
    lastDropRef.current = undefined;
    setFailure(undefined);
  }
  const drag = useTreeDrag({
    enabled: props.enabled,
    isInvalidTarget: props.isInvalidTarget,
    onDropPlacement: handleDrop,
  });
  return { dismiss, drag, failure, forget, retry };
}
