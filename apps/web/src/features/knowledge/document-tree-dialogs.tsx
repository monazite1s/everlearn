/** @fileoverview 管理文档创建与重命名对话框的表单与失败恢复。 */

'use client';

import {
  DOCUMENT_TITLE_MAX_LENGTH,
  type DocumentDetail,
  type DocumentTreeItem,
} from '@everlearn/contracts';
import { AlertCircleIcon, Loader2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
} from '@everlearn/ui';

import {
  createDocument,
  getDocument,
  renameDocument,
  type DocumentApiFailure,
} from './document-api';
import { KnowledgeDialogActions } from './knowledge-dialog-actions';

/** 用于渲染文档对话框共享的失败提示块。 */
function DocumentFailureAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>操作失败</AlertTitle>
      <AlertDescription>
        <p className="m-0">{message}</p>
      </AlertDescription>
    </Alert>
  );
}

/** 用于在重命名冲突后提供读取最新版本的指引。 */
function DocumentConflictAlert(props: {
  documentId: string;
  onReloaded: (detail: DocumentDetail) => void;
}) {
  const [failure, setFailure] = useState<DocumentApiFailure>();
  const [loading, setLoading] = useState(false);
  /** 用于读取服务端最新详情且保留当前输入。 */
  async function reload(): Promise<void> {
    if (loading) return;
    setLoading(true);
    setFailure(undefined);
    const result = await getDocument(props.documentId);
    setLoading(false);
    if (!result.ok) return setFailure(result.error);
    props.onReloaded(result.data);
  }
  return (
    <Alert variant="destructive">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>版本冲突</AlertTitle>
      <AlertDescription>
        <p className="m-0">存在新版本。你的输入已保留，请读取最新版本后重新保存。</p>
        {failure && <p className="m-0">{failure.message}</p>}
        <Button
          className="mt-2"
          disabled={loading}
          onClick={() => void reload()}
          size="sm"
          type="button"
          variant="outline"
        >
          {loading && <Loader2Icon aria-hidden="true" className="animate-spin" />}
          读取最新版本
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** 用于渲染标题字段与其长度约束。 */
function DocumentTitleField(props: {
  disabled: boolean;
  id: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={props.id}>标题</FieldLabel>
        <Input
          autoFocus
          disabled={props.disabled}
          id={props.id}
          maxLength={DOCUMENT_TITLE_MAX_LENGTH}
          onChange={(event) => props.onChange(event.currentTarget.value)}
          required
          value={props.value}
        />
      </Field>
    </FieldGroup>
  );
}

interface CreateDocumentDialogProps {
  readonly knowledgeBaseId: string;
  readonly offline: boolean;
  readonly opened: boolean;
  readonly parentId?: string;
  readonly parentTitle?: string;
  readonly onClose: () => void;
  readonly onCreated: (detail: DocumentDetail) => void;
  readonly onUncertain: () => void;
}

/** 用于提交创建并在失败后保留输入。 */
function useCreateDocument(props: CreateDocumentDialogProps) {
  const [title, setTitle] = useState('');
  const [failure, setFailure] = useState<DocumentApiFailure>();
  const [submitting, setSubmitting] = useState(false);
  /** 用于创建文档并只在服务端确认后并入树。 */
  async function submit(): Promise<void> {
    const normalized = title.trim();
    if (submitting || normalized.length === 0) return;
    setSubmitting(true);
    setFailure(undefined);
    const result = await createDocument(props.knowledgeBaseId, {
      ...(props.parentId ? { parentId: props.parentId } : {}),
      title: normalized,
    });
    setSubmitting(false);
    if (result.ok) {
      props.onCreated(result.data);
      props.onClose();
      return;
    }
    setFailure(result.error);
    if (result.error.certainty === 'unknown') props.onUncertain();
  }
  return { failure, setTitle, submit, submitting, title };
}

/** 用于承载新建根或子文档的对话框。 */
export function CreateDocumentDialog(props: CreateDocumentDialogProps) {
  const create = useCreateDocument(props);
  const titleId = useId();
  /** 用于通过原生表单提交统一键盘和指针行为。 */
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void create.submit();
  }
  const header = (
    <DialogHeader>
      <DialogTitle>新建文档</DialogTitle>
      {props.parentTitle && (
        <DialogDescription>将在“{props.parentTitle}”下创建子文档。</DialogDescription>
      )}
    </DialogHeader>
  );
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next && !create.submitting) props.onClose();
      }}
      open={props.opened}
    >
      <DialogContent>
        {header}
        <form onSubmit={submit}>
          <div className="grid gap-4">
            {create.failure && <DocumentFailureAlert message={create.failure.message} />}
            <DocumentTitleField
              disabled={create.submitting || props.offline}
              id={titleId}
              onChange={create.setTitle}
              value={create.title}
            />
            <KnowledgeDialogActions
              invalid={!create.title.trim() || props.offline}
              onCancel={props.onClose}
              submitLabel="创建文档"
              submitting={create.submitting}
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface RenameDocumentDialogProps {
  readonly item: DocumentTreeItem;
  readonly offline: boolean;
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly onDetailAccepted: (detail: DocumentDetail) => void;
}

/** 用于按最后观察版本重命名并在失败后保留输入。 */
function useRenameDocument(props: RenameDocumentDialogProps) {
  const [title, setTitle] = useState(props.item.title);
  const [version, setVersion] = useState(props.item.version);
  const [failure, setFailure] = useState<DocumentApiFailure>();
  const [saving, setSaving] = useState(false);
  /** 用于接收服务端较新详情且保留表单输入。 */
  function acceptLatest(detail: DocumentDetail): void {
    props.onDetailAccepted(detail);
    setVersion(detail.version);
    setFailure(undefined);
  }
  /** 用于提交裁剪后的标题并只在确认后更新树。 */
  async function submit(): Promise<void> {
    const normalized = title.trim();
    if (saving || normalized.length === 0) return;
    setSaving(true);
    setFailure(undefined);
    const result = await renameDocument(props.item.id, { title: normalized, version });
    setSaving(false);
    if (!result.ok) return setFailure(result.error);
    props.onDetailAccepted(result.data);
    props.onClose();
  }
  return { acceptLatest, failure, saving, setTitle, submit, title };
}

/** 用于按失败类型渲染重命名对话框的反馈区块。 */
function RenameFeedback(props: {
  failure: DocumentApiFailure;
  item: DocumentTreeItem;
  onReloaded: (detail: DocumentDetail) => void;
}): ReactNode {
  if (props.failure.code !== 'VERSION_CONFLICT') {
    return <DocumentFailureAlert message={props.failure.message} />;
  }
  return <DocumentConflictAlert documentId={props.item.id} onReloaded={props.onReloaded} />;
}

/** 用于承载按版本重命名的对话框。 */
export function RenameDocumentDialog(props: RenameDocumentDialogProps) {
  const rename = useRenameDocument(props);
  const titleId = useId();
  /** 用于通过原生表单提交统一键盘和指针行为。 */
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void rename.submit();
  }
  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next && !rename.saving) props.onClose();
      }}
      open={props.opened}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重命名文档</DialogTitle>
          <DialogDescription>保存时按最后读取的版本校验，存在新版本会提示读取。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="grid gap-4">
            {rename.failure && (
              <RenameFeedback
                failure={rename.failure}
                item={props.item}
                onReloaded={rename.acceptLatest}
              />
            )}
            <DocumentTitleField
              disabled={rename.saving || props.offline}
              id={titleId}
              onChange={rename.setTitle}
              value={rename.title}
            />
            <KnowledgeDialogActions
              invalid={!rename.title.trim() || props.offline}
              onCancel={props.onClose}
              submitLabel="保存修改"
              submitting={rename.saving}
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
