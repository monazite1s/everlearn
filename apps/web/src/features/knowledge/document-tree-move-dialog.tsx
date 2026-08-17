/** @fileoverview 承载键盘「移动文档」对话框的父级与相邻位置选择。 */

'use client';

import type { DocumentTreeItem } from '@everlearn/contracts';
import { AlertCircleIcon } from 'lucide-react';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@everlearn/ui';

import { KnowledgeDialogActions } from './knowledge-dialog-actions';
import type {
  DocumentChildList,
  MoveFailureInfo,
  MoveOutcome,
  MoveParentOption,
  MovePlacement,
} from './document-tree-model';
import { ROOT_PARENT_VALUE } from './document-tree-model';

const END_POSITION_VALUE = '__end__';

/** 用于渲染移动对话框内的失败原因。 */
function MoveFailureAlert(props: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>移动失败</AlertTitle>
      <AlertDescription>
        <p className="m-0">{props.message}</p>
      </AlertDescription>
    </Alert>
  );
}

/** 用于渲染目标父级下拉并就地禁用非法目标。 */
function ParentSelect(props: {
  disabled: boolean;
  id: string;
  onChoose: (value: string) => void;
  options: readonly MoveParentOption[];
  value: string;
}) {
  return (
    <Select disabled={props.disabled} onValueChange={props.onChoose} value={props.value}>
      <SelectTrigger className="w-full" id={props.id}>
        <SelectValue placeholder="选择目标父级" />
      </SelectTrigger>
      <SelectContent>
        {props.options.map((option) => (
          <SelectItem disabled={option.disabled} key={option.id} value={option.id}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** 用于渲染相对位置下拉并排除被移动节点自身。 */
function PositionSelect(props: {
  disabled: boolean;
  id: string;
  items: readonly DocumentTreeItem[];
  onChoose: (value: string) => void;
  value: string;
}) {
  return (
    <Select disabled={props.disabled} onValueChange={props.onChoose} value={props.value}>
      <SelectTrigger className="w-full" id={props.id}>
        <SelectValue placeholder="选择位置" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={END_POSITION_VALUE}>移动到末尾</SelectItem>
        {props.items.map((item) => (
          <SelectItem key={item.id} value={item.id}>{`在“${item.title}”之前`}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** 用于持有移动表单状态并把选择换算为放置意图提交。 */
function useMoveForm(props: {
  currentParentId: string | null;
  offline: boolean;
  onClose: () => void;
  onMove: (placement: MovePlacement) => Promise<MoveOutcome>;
}) {
  const [parent, setParent] = useState(() => props.currentParentId ?? ROOT_PARENT_VALUE);
  const [position, setPosition] = useState(END_POSITION_VALUE);
  const [failure, setFailure] = useState<MoveFailureInfo>();
  const [submitting, setSubmitting] = useState(false);
  /** 用于切换父级时重置相邻位置以避免跨列表锚点。 */
  function chooseParent(next: string): void {
    setParent(next);
    setPosition(END_POSITION_VALUE);
  }
  /** 用于提交当前选择并只在失败时保留表单状态。 */
  async function submit(): Promise<void> {
    if (submitting || props.offline) return;
    const targetParentId = parent === ROOT_PARENT_VALUE ? null : parent;
    const placement: MovePlacement =
      position === END_POSITION_VALUE
        ? { intent: 'into', targetParentId }
        : { anchorId: position, intent: 'before', targetParentId };
    setSubmitting(true);
    setFailure(undefined);
    const outcome = await props.onMove(placement);
    setSubmitting(false);
    if (outcome.ok) props.onClose();
    else setFailure(outcome.failure);
  }
  return { chooseParent, failure, parent, position, setPosition, submit, submitting };
}

/** 用于渲染父级与位置两个下拉字段。 */
function MoveSelectFields(props: {
  childListOf: (parentId?: string | null) => DocumentChildList;
  form: ReturnType<typeof useMoveForm>;
  itemId: string;
  offline: boolean;
  options: readonly MoveParentOption[];
}) {
  const { form } = props;
  const parentFieldId = useId();
  const positionFieldId = useId();
  const parentValue = form.parent === ROOT_PARENT_VALUE ? null : form.parent;
  const siblings = props.childListOf(parentValue).items.filter((item) => item.id !== props.itemId);
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={parentFieldId}>目标父级</FieldLabel>
        <ParentSelect
          disabled={form.submitting || props.offline}
          id={parentFieldId}
          onChoose={form.chooseParent}
          options={props.options}
          value={form.parent}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={positionFieldId}>位置</FieldLabel>
        <PositionSelect
          disabled={form.submitting || props.offline}
          id={positionFieldId}
          items={siblings}
          onChoose={form.setPosition}
          value={form.position}
        />
      </Field>
    </FieldGroup>
  );
}

/** 用于渲染移动表单字段、失败提示与提交操作。 */
function MoveFormFields(props: {
  childListOf: (parentId?: string | null) => DocumentChildList;
  form: ReturnType<typeof useMoveForm>;
  itemId: string;
  offline: boolean;
  onClose: () => void;
  options: readonly MoveParentOption[];
}) {
  const { form } = props;
  /** 用于通过原生表单提交统一键盘和指针行为。 */
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void form.submit();
  }
  return (
    <form onSubmit={submit}>
      <div className="grid gap-4">
        {form.failure && <MoveFailureAlert message={form.failure.message} />}
        <MoveSelectFields
          childListOf={props.childListOf}
          form={form}
          itemId={props.itemId}
          offline={props.offline}
          options={props.options}
        />
        <KnowledgeDialogActions
          invalid={props.offline}
          onCancel={props.onClose}
          submitLabel="移动文档"
          submitting={form.submitting}
        />
      </div>
    </form>
  );
}

export interface MoveDocumentDialogProps {
  readonly childListOf: (parentId?: string | null) => DocumentChildList;
  readonly currentParentId: string | null;
  readonly item: DocumentTreeItem;
  readonly offline: boolean;
  readonly onClose: () => void;
  readonly onMove: (placement: MovePlacement) => Promise<MoveOutcome>;
  readonly opened: boolean;
  readonly options: readonly MoveParentOption[];
}

/** 用于承载键盘移动的父级与相邻位置选择对话框。 */
export function MoveDocumentDialog(props: MoveDocumentDialogProps) {
  const form = useMoveForm(props);
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next && !form.submitting) props.onClose();
      }}
      open={props.opened}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>移动文档</DialogTitle>
          <DialogDescription>{`选择目标父级与位置，移动“${props.item.title}”。`}</DialogDescription>
        </DialogHeader>
        <MoveFormFields
          childListOf={props.childListOf}
          form={form}
          itemId={props.item.id}
          offline={props.offline}
          onClose={props.onClose}
          options={props.options}
        />
      </DialogContent>
    </Dialog>
  );
}
