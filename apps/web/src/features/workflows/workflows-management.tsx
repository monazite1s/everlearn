/**
 * @fileoverview 渲染工作流最小列表、模板创建、发布与运行触发。
 */

'use client';

import { Loader2Icon, PlayIcon, PlusIcon } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { Button, Input } from '@everlearn/ui';

import { ListSkeleton } from '../../shared/list-skeleton';
import { LoadFailure } from '../../shared/load-failure';
import { PageShell } from '../../shared/page-shell';
import {
  createWorkflow,
  listRuns,
  listWorkflows,
  saveTemplateAndPublish,
  startWorkflowRun,
} from './workflows-api';
import type { WorkflowItem, WorkflowRunItem } from './workflows-api';

/** 内置模板：读文档 → LLM → 建新文档。 */
const TEMPLATE_DEFINITION = {
  edges: [
    { from: 'read', to: 'draft' },
    { from: 'draft', to: 'write' },
    { from: 'write', to: 'end' },
  ],
  nodes: [
    { config: { documentId: '' }, id: 'read', type: 'kb.read' },
    { config: { prompt: '请总结以下内容：{{read}}' }, id: 'draft', type: 'llm.generate' },
    {
      config: { knowledgeBaseId: '', sourceNodeId: 'draft', title: '工作流生成' },
      id: 'write',
      type: 'doc.create',
    },
    { config: {}, id: 'end', type: 'workflow.end' },
  ],
  version: 1,
} as const;

/** 创建工作流表单属性。 */
interface CreateWorkflowFormProps {
  readonly name: string;
  readonly onCreate: (event: FormEvent) => Promise<void>;
  readonly onNameChange: (name: string) => void;
  readonly pending: boolean;
}

/** 用于渲染创建工作流表单。 */
function CreateWorkflowForm({ name, onCreate, onNameChange, pending }: CreateWorkflowFormProps) {
  return (
    <form
      aria-label="创建工作流"
      className="mt-2 flex gap-2"
      onSubmit={(event) => void onCreate(event)}
    >
      <Input
        maxLength={120}
        onChange={(event) => onNameChange(event.target.value)}
        placeholder="工作流名称"
        value={name}
      />
      <Button disabled={pending || name.trim().length === 0} type="submit">
        {pending ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <PlusIcon className="size-4" />
        )}
        从模板创建
      </Button>
    </form>
  );
}

/** 用于渲染单条工作流及其运行入口。 */
function WorkflowListItem({
  item,
  onRun,
  pending,
}: {
  readonly item: WorkflowItem;
  readonly onRun: (workflowId: string) => void;
  readonly pending: boolean;
}) {
  return (
    <li
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
      key={item.id}
    >
      <div className="grid gap-0.5">
        <span className="font-medium text-foreground">{item.name}</span>
        <span className="text-sm text-muted-foreground">
          {item.publishedVersion === null ? '未发布' : `已发布 v${item.publishedVersion}`}
          {item.latestRunStatus !== null && ` · 最近运行：${item.latestRunStatus}`}
        </span>
      </div>
      <Button
        aria-label={`运行 ${item.name}`}
        disabled={pending || item.publishedVersion === null}
        onClick={() => onRun(item.id)}
      >
        <PlayIcon className="size-4" />
        运行
      </Button>
    </li>
  );
}

/** 用于渲染最近运行列表。 */
function RunsSection({ runs }: { readonly runs: readonly WorkflowRunItem[] }) {
  if (runs.length === 0) return null;
  return (
    <section aria-labelledby="workflow-runs-title" className="mt-8">
      <h2 className="m-0 text-title-small text-foreground" id="workflow-runs-title">
        最近运行
      </h2>
      <ul className="mt-2 grid gap-2">
        {runs.map((run) => (
          <li
            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
            key={run.id}
          >
            <span className="text-muted-foreground">
              {new Date(run.createdAt).toLocaleString()}
            </span>
            <span>
              {run.status}
              {run.errorCode !== null && `（${run.errorCode}）`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 用于创建模板工作流，失败时返回可展示消息。 */
async function createFromTemplate(name: string): Promise<string | null> {
  const created = await createWorkflow(name.trim());
  if (!created.ok) return created.error.message;
  const saved = await saveTemplateAndPublish(
    (created.data as { id: string }).id,
    TEMPLATE_DEFINITION,
  );
  return saved.ok ? null : saved.error.message;
}

/** 用于启动工作流运行，失败时返回可展示消息。 */
async function startRun(workflowId: string): Promise<string | null> {
  const result = await startWorkflowRun(workflowId);
  return result.ok ? null : result.error.message;
}

/** 用于承载工作流列表、最近运行与首次加载状态。 */
function useWorkflowDirectory() {
  const [items, setItems] = useState<WorkflowItem[] | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const [runs, setRuns] = useState<WorkflowRunItem[]>([]);

  /** 用于加载工作流列表与最近运行。 */
  const refresh = useCallback(async () => {
    const result = await listWorkflows();
    if (!result.ok) {
      setLoadError(result.error.message);
      return;
    }
    setLoadError(undefined);
    setItems(result.data);
    if (result.data.length > 0) {
      const runsResult = await listRuns(result.data[0]!.id);
      if (runsResult.ok) setRuns(runsResult.data);
    }
  }, []);

  useEffect(() => {
    /** 首次加载定义在 effect 内，避免把加载器泄漏到组件作用域。 */
    const load = async () => {
      await refresh();
    };
    void load();
  }, [refresh]);

  return { items, loadError, refresh, runs };
}

/** 用于承载创建与运行动作的挂起和错误状态。 */
function useWorkflowActions(refresh: () => Promise<void>) {
  const [name, setName] = useState('');
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>(undefined);

  /** 用于一键创建、填充模板草稿并发布。 */
  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (pending || name.trim().length === 0) return;
    setPending(true);
    setActionError(undefined);
    const message = await createFromTemplate(name);
    setPending(false);
    if (message !== null) {
      setActionError(message);
      return;
    }
    setName('');
    await refresh();
  }

  /** 用于触发一次运行并刷新状态。 */
  async function handleRun(workflowId: string): Promise<void> {
    setPending(true);
    const message = await startRun(workflowId);
    setPending(false);
    if (message !== null) setActionError(message);
    else await refresh();
  }

  return { actionError, handleCreate, handleRun, name, pending, setName };
}

/** 用于渲染工作流列表的主体状态分支。 */
function WorkflowListBody({
  items,
  loadError,
  onRefresh,
  onRun,
  pending,
}: {
  readonly items: WorkflowItem[] | undefined;
  readonly loadError: string | undefined;
  readonly onRefresh: () => void;
  readonly onRun: (workflowId: string) => void;
  readonly pending: boolean;
}) {
  return (
    <>
      {items === undefined && loadError !== undefined && (
        <LoadFailure
          description="请检查网络后重新读取工作流列表。"
          onRetry={onRefresh}
          title="无法读取工作流"
        />
      )}
      {items === undefined && loadError === undefined && <ListSkeleton count={3} />}
      {items?.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">还没有工作流，先用上方模板创建一个。</p>
      )}
      {items !== undefined && items.length > 0 && (
        <ul className="mt-6 grid gap-3">
          {items.map((item) => (
            <WorkflowListItem item={item} key={item.id} onRun={onRun} pending={pending} />
          ))}
        </ul>
      )}
    </>
  );
}

/** 用于渲染工作流最小管理页。 */
export function WorkflowsManagement() {
  const directory = useWorkflowDirectory();
  const actions = useWorkflowActions(directory.refresh);
  return (
    <PageShell
      lead="创建、发布并运行受限的工作流；执行状态由后台 Worker 更新。"
      title={
        <h1 data-page-title tabIndex={-1}>
          工作流
        </h1>
      }
    >
      <CreateWorkflowForm
        name={actions.name}
        onCreate={actions.handleCreate}
        onNameChange={actions.setName}
        pending={actions.pending}
      />
      {actions.actionError && (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {actions.actionError}
        </p>
      )}
      <WorkflowListBody
        items={directory.items}
        loadError={directory.loadError}
        onRefresh={() => void directory.refresh()}
        onRun={(id) => void actions.handleRun(id)}
        pending={actions.pending}
      />
      <RunsSection runs={directory.runs} />
    </PageShell>
  );
}
