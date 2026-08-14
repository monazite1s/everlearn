/** @fileoverview 管理桌面端知识库编辑和移入回收站交互。 */

'use client';

import { Alert, Button, Group, Menu, Modal, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { KNOWLEDGE_BASE_NAME_MAX_LENGTH, type KnowledgeBaseSummary } from '@everlearn/contracts';
import { AlertCircleIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
  onDescriptionChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onReloaded: (data: KnowledgeBaseSummary) => void;
}

const ICON_SIZE = 18;

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
    <Alert color="danger" icon={<AlertCircleIcon aria-hidden="true" size={16} />}>
      <Stack gap="xs">
        <Text size="sm">存在新版本。你的输入已保留，请读取最新版本后重新保存。</Text>
        {failure && <Text size="sm">{failure.message}</Text>}
        <Button loading={loading} onClick={() => void reload()} size="compact-sm" variant="light">
          读取最新版本
        </Button>
      </Stack>
    </Alert>
  );
}

/** 用于以 Mantine 表单控件渲染编辑字段和冲突指引。 */
function EditKnowledgeBaseFields({
  data,
  description,
  failure,
  name,
  onDescriptionChange,
  onNameChange,
  onReloaded,
}: EditFieldsProps) {
  return (
    <>
      {failure?.code === 'VERSION_CONFLICT' ? (
        <VersionConflictAlert data={data} onReloaded={onReloaded} />
      ) : failure ? (
        <Alert color="danger" icon={<AlertCircleIcon aria-hidden="true" size={16} />}>
          {failure.message}
        </Alert>
      ) : null}
      <TextInput
        autoFocus
        label="名称"
        maxLength={KNOWLEDGE_BASE_NAME_MAX_LENGTH}
        onChange={(event) => onNameChange(event.currentTarget.value)}
        required
        value={name}
      />
      <Textarea
        label="说明"
        maxLength={2000}
        minRows={3}
        onChange={(event) => onDescriptionChange(event.currentTarget.value)}
        value={description}
      />
    </>
  );
}

/** 用于渲染元数据对话框的取消和保存操作。 */
function EditKnowledgeBaseActions({
  disabled,
  onCancel,
  onSave,
  saving,
}: {
  disabled: boolean;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <Group justify="flex-end">
      <Button onClick={onCancel} variant="default">
        取消
      </Button>
      <Button disabled={disabled} loading={saving} onClick={onSave} type="button">
        保存修改
      </Button>
    </Group>
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
    <Modal onClose={onClose} opened={opened} title="编辑知识库">
      <Stack gap="md">
        <EditKnowledgeBaseFields
          data={data}
          description={edit.description}
          failure={edit.failure}
          name={edit.name}
          onDescriptionChange={edit.setDescription}
          onNameChange={edit.setName}
          onReloaded={edit.acceptLatest}
        />
        <EditKnowledgeBaseActions
          disabled={!edit.name.trim()}
          onCancel={onClose}
          onSave={() => void edit.submit()}
          saving={edit.saving}
        />
      </Stack>
    </Modal>
  );
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
  return (
    <Modal onClose={onClose} opened={opened} title="移入回收站">
      <Stack gap="md">
        <Text>
          “{data.name}”及其中 {data.documentCount} 篇文档将从正常列表中移除。回收站页面尚未提供，
          移入后当前无法自行恢复，请确认后再继续。
        </Text>
        {failure && (
          <Alert color="danger" icon={<AlertCircleIcon aria-hidden="true" size={16} />}>
            {failure.code === 'VERSION_CONFLICT'
              ? '知识库已发生变化。请取消操作并刷新后重新确认。'
              : failure.message}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button onClick={onClose} variant="default">
            取消
          </Button>
          <Button color="danger" loading={deleting} onClick={() => void confirmDelete()}>
            确认移入回收站
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** 用于渲染一次只打开一个管理对话框的受控 Mantine 菜单。 */
function ManagementMenu({
  disabled,
  onChange,
  onSelect,
  opened,
}: {
  disabled: boolean;
  onChange: (opened: boolean) => void;
  onSelect: (dialog: 'delete' | 'edit') => void;
  opened: boolean;
}) {
  return (
    <Menu
      keepMounted={false}
      onChange={onChange}
      opened={opened}
      position="bottom-end"
      shadow="md"
      width={220}
    >
      <Menu.Target>
        <Button
          aria-label="知识库操作"
          disabled={disabled}
          leftSection={<MoreHorizontalIcon aria-hidden="true" size={ICON_SIZE} />}
          variant="default"
        >
          管理
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item
          leftSection={<PencilIcon aria-hidden="true" size={16} />}
          onClick={() => onSelect('edit')}
        >
          编辑名称与说明
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          color="danger"
          leftSection={<Trash2Icon aria-hidden="true" size={16} />}
          onClick={() => onSelect('delete')}
        >
          移入回收站
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
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
  const [menuOpened, setMenuOpened] = useState(false);
  /** 用于在挂载所选管理对话框前关闭菜单。 */
  function selectDialog(selected: 'delete' | 'edit'): void {
    setMenuOpened(false);
    setDialog(selected);
  }
  return (
    <div>
      <ManagementMenu
        disabled={offline}
        onChange={setMenuOpened}
        onSelect={selectDialog}
        opened={menuOpened}
      />
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
