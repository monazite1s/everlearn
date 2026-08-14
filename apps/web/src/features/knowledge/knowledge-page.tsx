/** @fileoverview 渲染真实知识库列表和首次创建流程。 */

'use client';

import {
  Alert,
  Button,
  Group,
  Modal,
  Skeleton,
  Stack,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { KNOWLEDGE_BASE_NAME_MAX_LENGTH, type KnowledgeBaseSummary } from '@everlearn/contracts';
import { AlertCircleIcon, PlusIcon, RefreshCwIcon } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

import { OfflineNotice } from '../../app/offline-notice';
import { PageShell } from '../../app/page-shell';
import { useOnline } from '../../app/use-online';
import { createKnowledgeBase } from './knowledge-api';
import type { KnowledgeApiFailure } from './knowledge-api';
import { KnowledgeBaseCard } from './knowledge-base-card';
import { KnowledgeEmptyState } from './knowledge-empty-state';
import { useKnowledgeList } from './knowledge-list-state';
import type { KnowledgeLoadState } from './knowledge-list-state';
import styles from './knowledge-page.module.css';

interface CreateFormState {
  readonly description: string;
  readonly name: string;
}

const EMPTY_FORM: CreateFormState = { description: '', name: '' };
const ICON_SIZE = 18;
const DESCRIPTION_MAX_LENGTH = 2000;

/** 用于在首屏加载时保持最终列表结构。 */
function KnowledgeLoading() {
  return (
    <Stack aria-label="正在加载知识库" gap="sm" role="status">
      {[0, 1, 2].map((index) => (
        <Skeleton height={124} key={index} radius="md" />
      ))}
    </Stack>
  );
}

/** 用于展示可恢复读取失败且不替换成功内容。 */
function LoadFailure({ failure, onRetry }: { failure: KnowledgeApiFailure; onRetry: () => void }) {
  return (
    <Alert
      color="danger"
      icon={<AlertCircleIcon aria-hidden="true" size={ICON_SIZE} />}
      title="知识库列表未加载"
    >
      <p className={styles['alert-message']}>{failure.message}</p>
      <Button
        className={styles['alert-action']}
        leftSection={<RefreshCwIcon aria-hidden="true" size={16} />}
        onClick={onRetry}
        size="compact-sm"
        variant="light"
      >
        重新读取
      </Button>
    </Alert>
  );
}

/** 用于渲染两个已批准可编辑字段。 */
function CreateFields(props: {
  disabled: boolean;
  form: CreateFormState;
  nameError?: string;
  onChange: (form: CreateFormState) => void;
}) {
  const { disabled, form, nameError, onChange } = props;
  /** 用于更新名称并保留当前说明。 */
  function updateName(event: ChangeEvent<HTMLInputElement>): void {
    onChange({ ...form, name: event.currentTarget.value });
  }
  /** 用于更新说明并保留当前名称。 */
  function updateDescription(event: ChangeEvent<HTMLTextAreaElement>): void {
    onChange({ ...form, description: event.currentTarget.value });
  }
  return (
    <>
      <TextInput
        autoFocus
        disabled={disabled}
        error={nameError}
        label="名称"
        maxLength={KNOWLEDGE_BASE_NAME_MAX_LENGTH}
        onChange={updateName}
        placeholder="例如：Agent 工程"
        required
        value={form.name}
      />
      <Textarea
        disabled={disabled}
        label="说明"
        maxLength={DESCRIPTION_MAX_LENGTH}
        rows={3}
        onChange={updateDescription}
        placeholder="记录这个知识库的范围与用途"
        value={form.description}
      />
    </>
  );
}

/** 用于渲染创建失败告警。 */
function CreateFailureAlert({ error }: { error: KnowledgeApiFailure }) {
  return (
    <Alert
      color="danger"
      icon={<AlertCircleIcon aria-hidden="true" size={ICON_SIZE} />}
      title="创建失败"
    >
      <p className={styles['alert-message']}>{error.message}</p>
    </Alert>
  );
}

/** 用于渲染对话框底部操作。 */
function CreateDialogActions(props: {
  invalid: boolean;
  submitting: boolean;
  onCancel: () => void;
}) {
  const { invalid, submitting, onCancel } = props;
  return (
    <Group justify="flex-end">
      <Button disabled={submitting} onClick={onCancel} type="button" variant="default">
        取消
      </Button>
      <Button disabled={invalid} loading={submitting} type="submit">
        创建并进入
      </Button>
    </Group>
  );
}

/** 用于收集创建输入并在提交失败后保留。 */
function CreateDialog(props: {
  error?: KnowledgeApiFailure;
  form: CreateFormState;
  offline: boolean;
  submitting: boolean;
  onChange: (form: CreateFormState) => void;
  onClose: () => void;
  onSubmit: () => void;
  opened: boolean;
}) {
  const { error, form, offline, onChange, onClose, onSubmit, opened, submitting } = props;
  const nameError =
    form.name.trim().length > KNOWLEDGE_BASE_NAME_MAX_LENGTH
      ? `名称不能超过 ${KNOWLEDGE_BASE_NAME_MAX_LENGTH} 个字符。`
      : undefined;
  const invalid = form.name.trim().length === 0 || Boolean(nameError) || offline;
  /** 用于通过原生表单提交以统一键盘和指针行为。 */
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }
  return (
    <Modal
      closeButtonProps={{ 'aria-label': '关闭新建知识库' }}
      closeOnClickOutside={!submitting}
      closeOnEscape={!submitting}
      onClose={onClose}
      opened={opened}
      title="新建知识库"
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          {error && <CreateFailureAlert error={error} />}
          <CreateFields
            disabled={submitting || offline}
            form={form}
            {...(nameError ? { nameError } : {})}
            onChange={onChange}
          />
          <CreateDialogActions invalid={invalid} submitting={submitting} onCancel={onClose} />
        </Stack>
      </form>
    </Modal>
  );
}

/** 用于渲染列表内容并局部处理后续分页失败。 */
function KnowledgeListContent(props: {
  items: readonly KnowledgeBaseSummary[];
  load: KnowledgeLoadState;
  onLoadMore: () => void;
  onRetry: () => void;
}) {
  const { items, load, onLoadMore, onRetry } = props;
  if (load.loading && items.length === 0) return <KnowledgeLoading />;
  if (load.error && items.length === 0)
    return <LoadFailure failure={load.error} onRetry={onRetry} />;
  if (items.length === 0) return <KnowledgeEmptyState />;
  return (
    <>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id}>
            <KnowledgeBaseCard knowledgeBase={item} />
          </li>
        ))}
      </ul>
      {load.error && <LoadFailure failure={load.error} onRetry={onRetry} />}
      {!load.error && load.nextCursor && (
        <Button loading={load.loading} onClick={onLoadMore} variant="subtle">
          加载更多
        </Button>
      )}
    </>
  );
}

/** 用于管理创建对话框且只在服务端确认资源后导航。 */
function useCreateKnowledgeBase(refresh: () => Promise<void>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM);
  const [error, setError] = useState<KnowledgeApiFailure>();
  const [locallyOpened, setLocallyOpened] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const urlOpened = searchParams.get('create') === 'knowledge-base';
  const opened = locallyOpened || urlOpened;
  /** 用于创建知识库并通过重新读取恢复不确定传输结果。 */
  async function submit(): Promise<void> {
    const name = form.name.trim();
    if (submitting || name.length === 0 || name.length > KNOWLEDGE_BASE_NAME_MAX_LENGTH) return;
    setSubmitting(true);
    setError(undefined);
    const result = await createKnowledgeBase({
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      name,
    });
    if (result.ok) {
      router.push(`/knowledge/${result.data.id}`);
      return;
    }
    setError(result.error);
    setSubmitting(false);
    if (result.error.certainty === 'unknown') await refresh();
  }
  /** 用于打开页面所属的创建对话框。 */
  function open(): void {
    setLocallyOpened(true);
  }
  /** 用于关闭对话框并清理 URL 参数。 */
  function close(): void {
    if (submitting) return;
    setLocallyOpened(false);
    if (urlOpened) router.replace('/knowledge');
  }
  return { close, error, form, open, opened, setForm, submit, submitting };
}

/** 用于渲染列表页主操作。 */
function KnowledgeCreateAction({
  disabled,
  onCreate,
}: {
  disabled: boolean;
  onCreate: () => void;
}) {
  return (
    <Button
      className={styles['desktop-create']}
      disabled={disabled}
      leftSection={<PlusIcon aria-hidden="true" size={ICON_SIZE} />}
      onClick={onCreate}
    >
      新建知识库
    </Button>
  );
}

/** 用于渲染完整真实知识库列表组合。 */
export function KnowledgePage() {
  const online = useOnline();
  const { items, load, read } = useKnowledgeList();
  const create = useCreateKnowledgeBase(
    /** 用于在写入结果不确定后刷新第一页。 */ async function refresh() {
      await read();
    },
  );
  /** 用于重试当前列表状态中的失败分页。 */
  function retry(): void {
    void read(items.length > 0 ? (load.nextCursor ?? undefined) : undefined);
  }
  /** 用于请求下一页不透明游标。 */
  function loadMore(): void {
    void read(load.nextCursor ?? undefined);
  }
  return (
    <PageShell
      actions={<KnowledgeCreateAction disabled={!online} onCreate={create.open} />}
      eyebrow="Everlearn · 知识库"
      lead="长期沉淀文档、教程与资讯简报，按最近活动排序。"
      title={
        <h1 data-page-title tabIndex={-1}>
          知识库
        </h1>
      }
    >
      {!online && <OfflineNotice />}
      <section aria-labelledby="knowledge-list-title" className={styles.content}>
        <Title id="knowledge-list-title" order={2} size="h3">
          全部知识库
        </Title>
        <KnowledgeListContent items={items} load={load} onLoadMore={loadMore} onRetry={retry} />
      </section>
      <CreateDialog
        {...(create.error ? { error: create.error } : {})}
        form={create.form}
        offline={!online}
        onChange={create.setForm}
        onClose={create.close}
        onSubmit={() => void create.submit()}
        opened={create.opened}
        submitting={create.submitting}
      />
    </PageShell>
  );
}
