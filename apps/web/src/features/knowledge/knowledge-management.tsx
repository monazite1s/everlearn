/** @fileoverview 管理桌面端知识库编辑和移入回收站交互。 */

'use client';

import { KNOWLEDGE_BASE_NAME_MAX_LENGTH, type KnowledgeBaseSummary } from '@everlearn/contracts';
import {
  AlertCircleIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Textarea,
} from '@everlearn/ui';

import {
  deleteKnowledgeBase,
  getKnowledgeBase,
  type KnowledgeApiFailure,
  updateKnowledgeBase,
} from './knowledge-api';

interface EditFieldsProps {
  data: KnowledgeBaseSummary;
  description: string;
  failure: KnowledgeApiFailure | undefined;
  name: string;
  saving: boolean;
  onDescriptionChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onReloaded: (data: KnowledgeBaseSummary) => void;
}

/** 用于渲染管理对话框共享的失败提示块。 */
function ManagementFailure({ message }: { message: string }) {
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

/** 用于重新读取服务端版本且保留用户编辑字段。 */
function VersionConflictAlert({
  data,
  onReloaded,
}: {
  data: KnowledgeBaseSummary;
  onReloaded: (data: KnowledgeBaseSummary) => void;
}) {
  const [failure, setFailure] = useState<KnowledgeApiFailure>();
  const [loading, setLoading] = useState(false);
  /** 用于在详情确认后只替换带版本摘要。 */
  async function reload(): Promise<void> {
    if (loading) return;
    setLoading(true);
    setFailure(undefined);
    const result = await getKnowledgeBase(data.id);
    setLoading(false);
    if (!result.ok) return setFailure(result.error);
    onReloaded(result.data);
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
          variant="outline"
        >
          {loading && <Loader2Icon aria-hidden="true" className="animate-spin" />}
          读取最新版本
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** 用于以共享表单结构渲染编辑字段和冲突指引。 */
function EditKnowledgeBaseFields({
  data,
  description,
  failure,
  name,
  saving,
  onDescriptionChange,
  onNameChange,
  onReloaded,
}: EditFieldsProps) {
  const nameId = useId();
  const descriptionId = useId();
  return (
    <FieldGroup>
      {failure?.code === 'VERSION_CONFLICT' ? (
        <VersionConflictAlert data={data} onReloaded={onReloaded} />
      ) : failure ? (
        <ManagementFailure message={failure.message} />
      ) : null}
      <Field>
        <FieldLabel htmlFor={nameId}>名称</FieldLabel>
        <Input
          autoFocus
          disabled={saving}
          id={nameId}
          maxLength={KNOWLEDGE_BASE_NAME_MAX_LENGTH}
          onChange={(event) => onNameChange(event.currentTarget.value)}
          required
          value={name}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={descriptionId}>说明</FieldLabel>
        <Textarea
          disabled={saving}
          id={descriptionId}
          maxLength={2000}
          onChange={(event) => onDescriptionChange(event.currentTarget.value)}
          rows={3}
          value={description}
        />
      </Field>
    </FieldGroup>
  );
}

/** 用于只编辑元数据并在版本冲突后保留输入。 */
function useEditKnowledgeBase({
  data,
  onSaved,
  onClose,
}: {
  data: KnowledgeBaseSummary;
  onSaved: (data: KnowledgeBaseSummary) => void;
  onClose: () => void;
}) {
  const [description, setDescription] = useState(data.description);
  const [name, setName] = useState(data.name);
  const [failure, setFailure] = useState<KnowledgeApiFailure>();
  const [saving, setSaving] = useState(false);
  /** 用于接收较新服务端版本且保留当前表单字段。 */
  function acceptLatest(latest: KnowledgeBaseSummary): void {
    onSaved(latest);
    setFailure(undefined);
  }
  /** 用于按最后观察版本保存裁剪后的元数据。 */
  async function submit(): Promise<void> {
    const normalizedName = name.trim();
    if (!normalizedName || saving) return;
    setSaving(true);
    setFailure(undefined);
    const result = await updateKnowledgeBase(data.id, {
      description: description.trim(),
      name: normalizedName,
      version: data.version,
    });
    setSaving(false);
    if (!result.ok) return setFailure(result.error);
    onSaved(result.data);
    onClose();
  }
  return {
    acceptLatest,
    description,
    failure,
    name,
    saving,
    setDescription,
    setName,
    submit,
  };
}

/** 用于承载只编辑元数据的对话框状态。 */
function EditKnowledgeBaseModal({
  data,
  onSaved,
  onClose,
  opened,
}: {
  data: KnowledgeBaseSummary;
  onSaved: (data: KnowledgeBaseSummary) => void;
  onClose: () => void;
  opened: boolean;
}) {
  const edit = useEditKnowledgeBase({ data, onClose, onSaved });
  return (
    <Dialog onOpenChange={(next) => (next ? undefined : onClose())} open={opened}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>编辑知识库</DialogTitle>
        </DialogHeader>
        <EditKnowledgeBaseFields
          data={data}
          description={edit.description}
          failure={edit.failure}
          name={edit.name}
          onDescriptionChange={edit.setDescription}
          onNameChange={edit.setName}
          onReloaded={edit.acceptLatest}
          saving={edit.saving}
        />
        <DialogFooter>
          <Button disabled={edit.saving} onClick={onClose} type="button" variant="outline">
            取消
          </Button>
          <Button disabled={!edit.name.trim() || edit.saving} onClick={() => void edit.submit()}>
            {edit.saving && <Loader2Icon aria-hidden="true" className="animate-spin" size={16} />}
            保存修改
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 用于管理删除请求状态且只在成功后离开页面。 */
function useDeleteKnowledgeBase(data: KnowledgeBaseSummary) {
  const router = useRouter();
  const [failure, setFailure] = useState<KnowledgeApiFailure>();
  const [deleting, setDeleting] = useState(false);
  /** 用于只删除一次并在结果不确定时保留可操作对话框。 */
  async function confirmDelete(): Promise<void> {
    if (deleting) return;
    setDeleting(true);
    setFailure(undefined);
    const result = await deleteKnowledgeBase(data.id, { version: data.version });
    setDeleting(false);
    if (!result.ok) return setFailure(result.error);
    router.push('/knowledge');
  }
  return { confirmDelete, deleting, failure };
}

/** 用于在知识库移入回收站前确认子树影响。 */
function DeleteKnowledgeBaseModal({
  data,
  onClose,
  opened,
}: {
  data: KnowledgeBaseSummary;
  onClose: () => void;
  opened: boolean;
}) {
  const { confirmDelete, deleting, failure } = useDeleteKnowledgeBase(data);
  return (
    <AlertDialog onOpenChange={(next) => (next ? undefined : onClose())} open={opened}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>移入回收站</AlertDialogTitle>
          <AlertDialogDescription>
            “{data.name}”及其中 {data.documentCount} 篇文档将从正常列表中移除。回收站页面尚未提供，
            移入后当前无法自行恢复，请确认后再继续。
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failure && (
          <ManagementFailure
            message={
              failure.code === 'VERSION_CONFLICT'
                ? '知识库已发生变化。请取消操作并刷新后重新确认。'
                : failure.message
            }
          />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void confirmDelete();
            }}
            variant="destructive"
          >
            {deleting && <Loader2Icon aria-hidden="true" className="animate-spin" size={16} />}
            确认移入回收站
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** 用于渲染一次只打开一个管理对话框的桌面菜单。 */
function ManagementMenu({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (dialog: 'delete' | 'edit') => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="知识库操作" disabled={disabled} variant="outline">
          <MoreHorizontalIcon aria-hidden="true" size={18} />
          管理
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onSelect('edit')}>
          <PencilIcon aria-hidden="true" size={16} />
          编辑名称与说明
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onSelect('delete')} variant="destructive">
          <Trash2Icon aria-hidden="true" size={16} />
          移入回收站
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 用于提供桌面知识库管理。 */
export function KnowledgeManagement({
  data,
  offline,
  onSaved,
}: {
  data: KnowledgeBaseSummary;
  offline: boolean;
  onSaved: (data: KnowledgeBaseSummary) => void;
}) {
  const [dialog, setDialog] = useState<'delete' | 'edit'>();
  return (
    <div>
      <ManagementMenu disabled={offline} onSelect={setDialog} />
      {dialog === 'edit' && (
        <EditKnowledgeBaseModal
          data={data}
          onClose={() => setDialog(undefined)}
          onSaved={onSaved}
          opened
        />
      )}
      {dialog === 'delete' && (
        <DeleteKnowledgeBaseModal data={data} onClose={() => setDialog(undefined)} opened />
      )}
    </div>
  );
}
