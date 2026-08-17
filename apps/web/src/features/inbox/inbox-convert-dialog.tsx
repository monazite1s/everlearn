/** @fileoverview 渲染把待处理记录幂等转换为知识库文档的对话框。 */

'use client';

import type {
  DocumentTreeItem,
  InboxItemSummary,
  KnowledgeBaseSummary,
} from '@everlearn/contracts';
import { DOCUMENT_TITLE_MAX_LENGTH } from '@everlearn/contracts';
import { AlertCircleIcon, Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@everlearn/ui';

import { listDocuments } from '../knowledge/document-api';
import { listKnowledgeBases } from '../knowledge/knowledge-api';
import { convertInboxItem } from './inbox-api';
import type { InboxApiFailure } from './inbox-api';

const ROOT_PARENT_VALUE = 'root';
const TITLE_SOURCE_LENGTH = 80;

interface ChoiceState<T> {
  readonly error?: { readonly message: string };
  readonly items: readonly T[];
}

/** 用于渲染目标下拉的加载骨架或失败提示。 */
function ChoicePending(props: {
  loadingText: string;
  state: { readonly error?: { readonly message: string } } | undefined;
}) {
  if (props.state === undefined) {
    return (
      <div aria-label={props.loadingText} role="status">
        <Skeleton className="h-9" />
      </div>
    );
  }
  if (props.state.error) {
    return (
      <p className="m-0 text-sm text-destructive" role="alert">
        {props.state.error.message}
      </p>
    );
  }
  return null;
}

/** 用于在挂载后异步读取第一页知识库并维护加载与失败状态。 */
function useKnowledgeBaseChoices(): ChoiceState<KnowledgeBaseSummary> | undefined {
  const [bases, setBases] = useState<ChoiceState<KnowledgeBaseSummary>>();
  useEffect(
    /** 用于读取一次目标知识库候选列表。 */
    function loadBases(): void {
      void listKnowledgeBases().then((result) => {
        setBases(result.ok ? { items: result.data.items } : { error: result.error, items: [] });
      });
    },
    [],
  );
  return bases;
}

/** 用于在选定知识库后异步读取其根级文档作为父级候选。 */
function useRootChoices(baseId: string | undefined): ChoiceState<DocumentTreeItem> | undefined {
  const [loaded, setLoaded] = useState<{ baseId: string; state: ChoiceState<DocumentTreeItem> }>();
  useEffect(
    /** 用于读取与当前选定知识库匹配的根级文档。 */
    function loadRoots(): void {
      if (baseId === undefined || loaded?.baseId === baseId) return;
      void listDocuments(baseId).then((result) => {
        setLoaded({
          baseId,
          state: result.ok ? { items: result.data.items } : { error: result.error, items: [] },
        });
      });
    },
    [baseId, loaded?.baseId],
  );
  if (baseId === undefined) return undefined;
  return loaded?.baseId === baseId ? loaded.state : undefined;
}

/** 用于提交转换并在确定结果前复用同一幂等键。 */
function useConvertSubmission(props: {
  item: InboxItemSummary;
  onClose: () => void;
  onResync: () => Promise<readonly InboxItemSummary[] | undefined>;
}) {
  const router = useRouter();
  const keyRef = useRef<string | undefined>(undefined);
  const [failure, setFailure] = useState<InboxApiFailure>();
  const [submitting, setSubmitting] = useState(false);
  /** 用于按当前选择提交转换并按结果类别收尾。 */
  async function submit(request: { knowledgeBaseId: string; parentId?: string; title: string }) {
    if (submitting) return;
    keyRef.current ??= crypto.randomUUID();
    setSubmitting(true);
    setFailure(undefined);
    const result = await convertInboxItem(props.item.id, request, keyRef.current);
    setSubmitting(false);
    if (result.ok) {
      keyRef.current = undefined;
      await props.onResync();
      router.push(`/knowledge/${request.knowledgeBaseId}`);
      return;
    }
    if (result.error.code === 'IDEMPOTENCY_CONFLICT') keyRef.current = undefined;
    if (result.error.code === 'NOT_FOUND') {
      await props.onResync();
      props.onClose();
      return;
    }
    setFailure(result.error);
  }
  return { failure, submit, submitting };
}

/** 用于渲染转换失败或冲突时的可行动提示。 */
function ConvertFailureAlert({ failure }: { failure: InboxApiFailure }) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>转换失败</AlertTitle>
      <AlertDescription>
        <p className="m-0">{failure.message}</p>
      </AlertDescription>
    </Alert>
  );
}

/** 用于渲染目标知识库下拉及其加载与失败状态。 */
function KnowledgeBaseField(props: {
  disabled: boolean;
  state: ChoiceState<KnowledgeBaseSummary> | undefined;
  value: string | undefined;
  onChoose: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="convert-knowledge-base">目标知识库</FieldLabel>
      <Select onValueChange={props.onChoose} value={props.value ?? ''}>
        <SelectTrigger className="w-full" disabled={props.disabled} id="convert-knowledge-base">
          <SelectValue placeholder="选择目标知识库" />
        </SelectTrigger>
        <SelectContent>
          {(props.state?.items ?? []).map((base) => (
            <SelectItem key={base.id} value={base.id}>
              {base.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <ChoicePending loadingText="正在加载知识库" state={props.state} />
    </Field>
  );
}

/** 用于渲染父级下拉并说明按需加载边界。 */
function ParentField(props: {
  baseId: string | undefined;
  disabled: boolean;
  state: ChoiceState<DocumentTreeItem> | undefined;
  value: string;
  onChoose: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="convert-parent">父级文档</FieldLabel>
      <Select onValueChange={props.onChoose} value={props.value}>
        <SelectTrigger
          className="w-full"
          disabled={props.disabled || props.baseId === undefined}
          id="convert-parent"
        >
          <SelectValue placeholder="选择父级" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ROOT_PARENT_VALUE}>知识库根</SelectItem>
          {(props.state?.items ?? []).map((root) => (
            <SelectItem key={root.id} value={root.id}>
              {root.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>未展开的子树需先到目标知识库展开后再转换。</FieldDescription>
      {props.baseId !== undefined && (
        <ChoicePending loadingText="正在加载父级" state={props.state} />
      )}
    </Field>
  );
}

/** 用于渲染默认取自记录内容的标题输入。 */
function ConvertTitleField(props: {
  disabled: boolean;
  title: string;
  onTitleChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor="convert-title">标题</FieldLabel>
      <Input
        disabled={props.disabled}
        id="convert-title"
        maxLength={DOCUMENT_TITLE_MAX_LENGTH}
        onChange={(event) => props.onTitleChange(event.currentTarget.value)}
        required
        value={props.title}
      />
    </Field>
  );
}

/** 用于渲染取消与提交操作。 */
function ConvertDialogActions(props: {
  disabled: boolean;
  submitDisabled: boolean;
  submitting: boolean;
  onCancel: () => void;
}) {
  return (
    <DialogFooter>
      <Button disabled={props.disabled} onClick={props.onCancel} type="button" variant="outline">
        取消
      </Button>
      <Button disabled={props.disabled || props.submitDisabled} type="submit">
        {props.submitting && <Loader2Icon aria-hidden="true" className="animate-spin" size={16} />}
        转换并进入
      </Button>
    </DialogFooter>
  );
}

/** 用于渲染转换表单的字段组合与底部操作。 */
function ConvertForm(props: {
  baseId: string | undefined;
  bases: ChoiceState<KnowledgeBaseSummary> | undefined;
  disabled: boolean;
  formSubmit: (event: FormEvent<HTMLFormElement>) => void;
  parentChoice: string;
  roots: ChoiceState<DocumentTreeItem> | undefined;
  submission: { failure: InboxApiFailure | undefined; submitting: boolean };
  submitDisabled: boolean;
  title: string;
  onCancel: () => void;
  onBaseChoose: (value: string) => void;
  onParentChoose: (value: string) => void;
  onTitleChange: (value: string) => void;
}) {
  const disabled = props.disabled;
  return (
    <form onSubmit={props.formSubmit}>
      <div className="grid gap-4">
        {props.submission.failure && <ConvertFailureAlert failure={props.submission.failure} />}
        <FieldGroup>
          <KnowledgeBaseField
            disabled={disabled}
            state={props.bases}
            value={props.baseId}
            onChoose={props.onBaseChoose}
          />
          <ParentField
            baseId={props.baseId}
            disabled={disabled}
            state={props.roots}
            value={props.parentChoice}
            onChoose={props.onParentChoose}
          />
          <ConvertTitleField
            disabled={disabled}
            title={props.title}
            onTitleChange={props.onTitleChange}
          />
        </FieldGroup>
        <ConvertDialogActions
          disabled={disabled}
          submitDisabled={props.submitDisabled}
          submitting={props.submission.submitting}
          onCancel={props.onCancel}
        />
      </div>
    </form>
  );
}

/** 用于渲染对话框标题与记录内容摘要说明。 */
function ConvertDialogHeader({ content }: { content: string }) {
  return (
    <DialogHeader>
      <DialogTitle>转换为文档</DialogTitle>
      <DialogDescription>
        把“{content.slice(0, 24)}…”整理进指定知识库，转换后记录将离开 Inbox。
      </DialogDescription>
    </DialogHeader>
  );
}

interface ConvertDialogProps {
  readonly item: InboxItemSummary;
  readonly offline: boolean;
  readonly onClose: () => void;
  readonly onResync: () => Promise<readonly InboxItemSummary[] | undefined>;
}

/** 用于渲染目标选择、标题编辑与幂等提交的转换对话框。 */
export function InboxConvertDialog(props: ConvertDialogProps) {
  const { item, offline, onClose, onResync } = props;
  const [baseId, setBaseId] = useState<string>();
  const [parentChoice, setParentChoice] = useState(ROOT_PARENT_VALUE);
  const [title, setTitle] = useState(() => item.content.slice(0, TITLE_SOURCE_LENGTH).trim());
  const bases = useKnowledgeBaseChoices();
  const roots = useRootChoices(baseId);
  const submission = useConvertSubmission({ item, onClose, onResync });
  /** 用于切换目标知识库并把父级重置回知识库根。 */
  function chooseBase(value: string): void {
    setBaseId(value);
    setParentChoice(ROOT_PARENT_VALUE);
  }
  /** 用于在提交进行中拦截关闭请求。 */
  function requestClose(): void {
    if (!submission.submitting) onClose();
  }
  /** 用于以当前选择发起一次转换提交。 */
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (baseId === undefined || !title.trim() || offline) return;
    void submission.submit({
      knowledgeBaseId: baseId,
      ...(parentChoice === ROOT_PARENT_VALUE ? {} : { parentId: parentChoice }),
      title: title.trim(),
    });
  }
  return (
    <Dialog onOpenChange={(next) => (next ? undefined : requestClose())} open>
      <DialogContent aria-describedby={undefined}>
        <ConvertDialogHeader content={item.content} />
        <ConvertForm
          baseId={baseId}
          bases={bases}
          disabled={offline || submission.submitting}
          formSubmit={submit}
          parentChoice={parentChoice}
          roots={roots}
          submission={submission}
          submitDisabled={baseId === undefined || !title.trim()}
          title={title}
          onCancel={onClose}
          onBaseChoose={chooseBase}
          onParentChoose={setParentChoice}
          onTitleChange={setTitle}
        />
      </DialogContent>
    </Dialog>
  );
}
