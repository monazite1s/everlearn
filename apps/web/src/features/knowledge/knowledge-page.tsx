/** @fileoverview 渲染真实知识库列表和首次创建流程。 */

'use client';

import { KNOWLEDGE_BASE_NAME_MAX_LENGTH, type KnowledgeBaseSummary } from '@everlearn/contracts';
import {
  AlertCircleIcon,
  FileTextIcon,
  InboxIcon,
  LibraryBigIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Textarea,
} from '@everlearn/ui';

import { ListSkeleton } from '../../shared/list-skeleton';
import { LoadFailure } from '../../shared/load-failure';
import { OfflineNotice } from '../../shared/offline-notice';
import { PageShell } from '../../shared/page-shell';
import { SectionCards } from '../../shared/section-cards';
import { useOnline } from '../../shared/use-online';
import { createKnowledgeBase } from './knowledge-api';
import type { KnowledgeApiFailure } from './knowledge-api';
import { KnowledgeBaseCard } from './knowledge-base-card';
import { KnowledgeDialogActions } from './knowledge-dialog-actions';
import { KnowledgeEmptyState } from './knowledge-empty-state';
import { useKnowledgeList } from './knowledge-list-state';
import type { KnowledgeLoadState } from './knowledge-list-state';

interface CreateFormState {
  readonly description: string;
  readonly name: string;
}

const EMPTY_FORM: CreateFormState = { description: '', name: '' };
const DESCRIPTION_MAX_LENGTH = 2000;

/** 用于返回超长名称的字段错误。 */
function resolveNameError(name: string): string | undefined {
  return name.trim().length > KNOWLEDGE_BASE_NAME_MAX_LENGTH
    ? `名称不能超过 ${KNOWLEDGE_BASE_NAME_MAX_LENGTH} 个字符。`
    : undefined;
}

/** 用于渲染创建失败告警。 */
function CreateFailureAlert({ error }: { error: KnowledgeApiFailure }) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>创建失败</AlertTitle>
      <AlertDescription>
        <p className="m-0">{error.message}</p>
      </AlertDescription>
    </Alert>
  );
}

/** 用于渲染两个已批准可编辑字段。 */
function CreateFields(props: {
  disabled: boolean;
  form: CreateFormState;
  nameError?: string;
  nameId: string;
  descriptionId: string;
  onChange: (form: CreateFormState) => void;
}) {
  const { disabled, form, nameError, nameId, descriptionId, onChange } = props;
  /** 用于更新名称并保留当前说明。 */
  function updateName(event: ChangeEvent<HTMLInputElement>): void {
    onChange({ ...form, name: event.currentTarget.value });
  }
  /** 用于更新说明并保留当前名称。 */
  function updateDescription(event: ChangeEvent<HTMLTextAreaElement>): void {
    onChange({ ...form, description: event.currentTarget.value });
  }
  return (
    <FieldGroup>
      <Field data-invalid={nameError ? true : undefined}>
        <FieldLabel htmlFor={nameId}>名称</FieldLabel>
        <Input
          aria-invalid={nameError ? true : undefined}
          autoFocus
          disabled={disabled}
          id={nameId}
          maxLength={KNOWLEDGE_BASE_NAME_MAX_LENGTH}
          onChange={updateName}
          placeholder="例如：Agent 工程"
          required
          value={form.name}
        />
        {nameError && <FieldError>{nameError}</FieldError>}
      </Field>
      <Field>
        <FieldLabel htmlFor={descriptionId}>说明</FieldLabel>
        <Textarea
          disabled={disabled}
          id={descriptionId}
          maxLength={DESCRIPTION_MAX_LENGTH}
          onChange={updateDescription}
          placeholder="记录这个知识库的范围与用途"
          rows={3}
          value={form.description}
        />
      </Field>
    </FieldGroup>
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
  const nameId = useId();
  const descriptionId = useId();
  const nameError = resolveNameError(form.name);
  const invalid = form.name.trim().length === 0 || Boolean(nameError) || offline;
  /** 用于通过原生表单提交以统一键盘和指针行为。 */
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit();
  }
  return (
    <Dialog onOpenChange={(next) => (next ? undefined : onClose())} open={opened}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>新建知识库</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit}>
          <div className="grid gap-4">
            {error && <CreateFailureAlert error={error} />}
            <CreateFields
              descriptionId={descriptionId}
              disabled={submitting || offline}
              form={form}
              nameId={nameId}
              {...(nameError ? { nameError } : {})}
              onChange={onChange}
            />
            <KnowledgeDialogActions
              invalid={invalid}
              onCancel={onClose}
              submitLabel="创建并进入"
              submitting={submitting}
            />
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
  if (load.loading && items.length === 0) return <ListSkeleton />;
  if (load.error && items.length === 0)
    return (
      <LoadFailure description={load.error.message} onRetry={onRetry} title="知识库列表未加载" />
    );
  if (items.length === 0) return <KnowledgeEmptyState />;
  return (
    <>
      <ul className="grid list-none gap-4 p-0 @xl/main:grid-cols-2 @5xl/main:grid-cols-3">
        {items.map((item) => (
          <li key={item.id}>
            <KnowledgeBaseCard knowledgeBase={item} />
          </li>
        ))}
      </ul>
      {load.error && (
        <LoadFailure description={load.error.message} onRetry={onRetry} title="知识库列表未加载" />
      )}
      {!load.error && load.nextCursor && (
        <Button className="mt-4" disabled={load.loading} onClick={onLoadMore} variant="outline">
          {load.loading && <Loader2Icon aria-hidden="true" className="animate-spin" />}
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

/** 用于渲染统计当前已加载列表的总量指标。 */
function KnowledgeSectionCards({ items }: { items: readonly KnowledgeBaseSummary[] }) {
  if (items.length === 0) return null;
  const documentCount = items.reduce((total, item) => total + item.documentCount, 0);
  return (
    <SectionCards
      items={[
        {
          hint: '当前账号下的知识库总数',
          icon: LibraryBigIcon,
          label: '全部知识库',
          value: String(items.length),
        },
        {
          hint: '各知识库文档数量之和',
          icon: FileTextIcon,
          label: '文档总数',
          value: String(documentCount),
        },
      ]}
    />
  );
}

/** 用于渲染页头主操作与离线禁用的新建入口。 */
function KnowledgeCreateAction({
  disabled,
  onCreate,
}: {
  disabled: boolean;
  onCreate: () => void;
}) {
  return (
    <Button className="hidden md:inline-flex" disabled={disabled} onClick={onCreate}>
      <PlusIcon aria-hidden="true" />
      新建知识库
    </Button>
  );
}

/** 用于渲染知识库页固定的 Inbox 次级入口。 */
function KnowledgeInboxLink() {
  return (
    <Button asChild variant="outline">
      <Link href="/knowledge/inbox">
        <InboxIcon aria-hidden="true" />
        Inbox
      </Link>
    </Button>
  );
}

/** 用于渲染知识库页固定的回收站次级入口。 */
function KnowledgeTrashLink() {
  return (
    <Button asChild variant="outline">
      <Link href="/knowledge/trash">
        <Trash2Icon aria-hidden="true" />
        回收站
      </Link>
    </Button>
  );
}

/** 用于渲染页头的 Inbox 与回收站入口和离线禁用的新建操作。 */
function KnowledgeHeaderActions({
  disabled,
  onCreate,
}: {
  disabled: boolean;
  onCreate: () => void;
}) {
  return (
    <>
      <KnowledgeInboxLink />
      <KnowledgeTrashLink />
      <KnowledgeCreateAction disabled={disabled} onCreate={onCreate} />
    </>
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
      actions={<KnowledgeHeaderActions disabled={!online} onCreate={create.open} />}
      lead="长期沉淀文档、教程与资讯简报，按最近活动排序。"
      title={
        <h1 data-page-title tabIndex={-1}>
          知识库
        </h1>
      }
    >
      {!online && <OfflineNotice />}
      <KnowledgeSectionCards items={items} />
      <section aria-labelledby="knowledge-list-title" className="mt-6 grid gap-4 md:mt-8">
        <h2 className="m-0 text-title-small text-foreground" id="knowledge-list-title">
          全部知识库
        </h2>
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
