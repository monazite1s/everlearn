/** @fileoverview Renders the real knowledge-base list and first-use creation flow. */

'use client';

import {
  Alert,
  Button,
  Group,
  Modal,
  Skeleton,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import type { KnowledgeBaseSummary } from '@everlearn/contracts';
import {
  AlertCircleIcon,
  LibraryBigIcon,
  PlusIcon,
  RefreshCwIcon,
  WifiOffIcon,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

import { createKnowledgeBase } from './knowledge-api';
import type { KnowledgeApiFailure } from './knowledge-api';
import { KnowledgeBaseCard } from './knowledge-base-card';
import { useKnowledgeList, useOnline } from './knowledge-list-state';
import type { KnowledgeLoadState } from './knowledge-list-state';
import styles from './knowledge-page.module.css';

interface CreateFormState {
  readonly description: string;
  readonly name: string;
}

const EMPTY_FORM: CreateFormState = { description: '', name: '' };
const ICON_SIZE = 18;

/** Preserves the final list geometry while the first page is loading. */
function KnowledgeLoading() {
  return (
    <Stack aria-label="正在加载知识库" gap="sm">
      {[0, 1, 2].map((index) => (
        <Skeleton height={126} key={index} radius="md" />
      ))}
    </Stack>
  );
}

/** Explains a recoverable read failure without replacing successful content. */
function LoadFailure({ failure, onRetry }: { failure: KnowledgeApiFailure; onRetry: () => void }) {
  return (
    <Alert
      color="red"
      icon={<AlertCircleIcon aria-hidden="true" size={ICON_SIZE} />}
      title="知识库列表未加载"
    >
      <Text size="sm">{failure.message}</Text>
      <Button
        leftSection={<RefreshCwIcon aria-hidden="true" size={16} />}
        mt="sm"
        onClick={onRetry}
        size="compact-sm"
        variant="light"
      >
        重新读取
      </Button>
    </Alert>
  );
}

/** Renders the two approved editable fields without inventing a form abstraction. */
function CreateFields(props: {
  disabled: boolean;
  form: CreateFormState;
  nameError?: string;
  onChange: (form: CreateFormState) => void;
}) {
  const { disabled, form, nameError, onChange } = props;
  /** Updates the name while retaining the current description. */
  function updateName(event: ChangeEvent<HTMLInputElement>): void {
    onChange({ ...form, name: event.currentTarget.value });
  }
  /** Updates the description while retaining the current name. */
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
        maxLength={201}
        onChange={updateName}
        placeholder="例如：Agent 工程"
        required
        value={form.name}
      />
      <Textarea
        disabled={disabled}
        label="说明"
        maxLength={2000}
        rows={3}
        onChange={updateDescription}
        placeholder="记录这个知识库的范围与用途"
        value={form.description}
      />
    </>
  );
}

/** Collects creation input while preserving it across unsuccessful submissions. */
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
  const nameError = form.name.trim().length > 200 ? '名称不能超过 200 个字符。' : undefined;
  const invalid = form.name.trim().length === 0 || Boolean(nameError) || offline;
  /** Submits through native form semantics so keyboard and pointer behavior stay equivalent. */
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
          {error && <Alert color="red">{error.message}</Alert>}
          <CreateFields
            disabled={submitting || offline}
            form={form}
            {...(nameError ? { nameError } : {})}
            onChange={onChange}
          />
          <Group justify="flex-end">
            <Button disabled={submitting} onClick={onClose} type="button" variant="subtle">
              取消
            </Button>
            <Button disabled={invalid} loading={submitting} type="submit">
              创建并进入
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

/** Renders first-use guidance while the page header owns the single primary action. */
function EmptyKnowledgeBases() {
  return (
    <Alert
      icon={<LibraryBigIcon aria-hidden="true" size={ICON_SIZE} />}
      title="建立你的第一个知识库"
    >
      <Text size="sm">从一个明确主题开始，之后可继续添加嵌套文档。</Text>
    </Alert>
  );
}

/** Renders list content and keeps subsequent-page failures local. */
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
  if (items.length === 0) return <EmptyKnowledgeBases />;
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

/** Owns the creation dialog and navigates only with a confirmed server resource. */
function useCreateKnowledgeBase(refresh: () => Promise<void>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<CreateFormState>(EMPTY_FORM);
  const [error, setError] = useState<KnowledgeApiFailure>();
  const [submitting, setSubmitting] = useState(false);
  const [opened, setOpened] = useState(searchParams.get('create') === 'knowledge-base');
  /** Creates one knowledge base and recovers uncertain transport results by reading. */
  async function submit(): Promise<void> {
    if (submitting || form.name.trim().length === 0 || form.name.trim().length > 200) return;
    setSubmitting(true);
    setError(undefined);
    const result = await createKnowledgeBase({
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      name: form.name.trim(),
    });
    if (result.ok) {
      router.push(`/knowledge/${result.data.id}`);
      return;
    }
    setError(result.error);
    setSubmitting(false);
    if (result.error.certainty === 'unknown') await refresh();
  }
  /** Opens the page-owned creation dialog. */
  function open(): void {
    setOpened(true);
  }
  /** Closes only a settled dialog and retains its form. */
  function close(): void {
    if (!submitting) setOpened(false);
  }
  return { close, error, form, open, opened, setForm, submit, submitting };
}

/** Renders the page title, summary, and single desktop creation action. */
function KnowledgeHeader({ disabled, onCreate }: { disabled: boolean; onCreate: () => void }) {
  return (
    <header className={styles.header}>
      <div>
        <Text className={styles.eyebrow}>Everlearn · 知识库</Text>
        <Title data-page-title order={1} tabIndex={-1}>
          知识库
        </Title>
        <Text c="dimmed" mt="sm">
          长期沉淀文档、教程与资讯简报，按最近活动排序。
        </Text>
      </div>
      <Button
        className={styles['desktop-create']}
        disabled={disabled}
        leftSection={<PlusIcon aria-hidden="true" size={ICON_SIZE} />}
        onClick={onCreate}
      >
        新建知识库
      </Button>
    </header>
  );
}

/** Renders the complete real knowledge-base list composition. */
export function KnowledgePage() {
  const online = useOnline();
  const { items, load, read } = useKnowledgeList();
  const create = useCreateKnowledgeBase(
    /** Refreshes the first page after an uncertain write. */ async function refresh() {
      await read();
    },
  );
  /** Retries the failed page represented by current list state. */
  function retry(): void {
    void read(items.length > 0 ? (load.nextCursor ?? undefined) : undefined);
  }
  /** Requests the next opaque cursor page. */
  function loadMore(): void {
    void read(load.nextCursor ?? undefined);
  }
  return (
    <article className={styles.page}>
      <KnowledgeHeader disabled={!online} onCreate={create.open} />
      {!online && (
        <Alert icon={<WifiOffIcon aria-hidden="true" size={ICON_SIZE} />} mt="lg" role="status">
          当前离线：已加载的知识库仍可查看，新建暂不可用。
        </Alert>
      )}
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
    </article>
  );
}
