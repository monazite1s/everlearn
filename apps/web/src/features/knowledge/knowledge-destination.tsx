/** @fileoverview 渲染持久化知识库概览和桌面管理流程。 */

'use client';

import { Alert, Button, Group, Skeleton, Stack, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import type { KnowledgeBaseSummary } from '@everlearn/contracts';
import { AlertCircleIcon, ArrowLeftIcon, RefreshCwIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { PageShell } from '../../shared/page-shell';
import { useOnline } from '../../shared/use-online';
import { getKnowledgeBase, type KnowledgeApiFailure } from './knowledge-api';
import styles from './knowledge-page.module.css';

interface KnowledgeDestinationProps {
  knowledgeBaseId: string;
}

interface DestinationState {
  readonly data?: KnowledgeBaseSummary;
  readonly error?: KnowledgeApiFailure;
  readonly loading: boolean;
  readonly resourceId: string;
}

const ICON_SIZE = 18;
const DESKTOP_QUERY = '(min-width: 48.0625em)';
/** 内容性失败重试必然复现。 */
const NON_RETRYABLE_CODES = new Set([
  'BAD_REQUEST',
  'IDEMPOTENCY_CONFLICT',
  'NOT_FOUND',
  'UNSUPPORTED_MEDIA_TYPE',
  'VALIDATION_FAILED',
  'VERSION_CONFLICT',
]);
const KnowledgeManagement = dynamic(
  () => import('./knowledge-management').then((module) => module.KnowledgeManagement),
  { ssr: false },
);

/** 用于判断失败是否可重试。 */
function isRetryable(error: KnowledgeApiFailure): boolean {
  return error.code === undefined || !NON_RETRYABLE_CODES.has(error.code);
}

/** 用于启动和取消详情读取并提供权威刷新操作。 */
function useKnowledgeSummary(
  knowledgeBaseId: string,
): [DestinationState, () => void, (data: KnowledgeBaseSummary) => void] {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DestinationState>({
    loading: true,
    resourceId: knowledgeBaseId,
  });
  useEffect(
    /** 用于从同源 API 同步当前可见摘要。 */
    function synchronizeSummary(): () => void {
      let active = true;
      void getKnowledgeBase(knowledgeBaseId).then(
        /** 用于只应用属于当前已挂载路由的响应。 */
        function applyIfActive(result): void {
          if (!active) return;
          setState(
            result.ok
              ? { data: result.data, loading: false, resourceId: knowledgeBaseId }
              : { error: result.error, loading: false, resourceId: knowledgeBaseId },
          );
        },
      );
      return /** Prevents stale route responses from changing visible state. */ function cancel(): void {
        active = false;
      };
    },
    [attempt, knowledgeBaseId],
  );
  /** 用于启动新的权威详情读取。 */
  function retry(): void {
    setState({ loading: true, resourceId: knowledgeBaseId });
    setAttempt((current) => current + 1);
  }
  /** 用于只在 API 响应确认后替换可见数据。 */
  function apply(data: KnowledgeBaseSummary): void {
    setState({ data, loading: false, resourceId: knowledgeBaseId });
  }
  const visibleState =
    state.resourceId === knowledgeBaseId ? state : { loading: true, resourceId: knowledgeBaseId };
  return [visibleState, retry, apply];
}

/** 用于渲染布局稳定的概览加载态。 */
function OverviewSkeleton() {
  return (
    <Stack aria-label="正在加载知识库摘要" gap="sm" role="status">
      <Skeleton height={20} width="60%" />
      <Skeleton height={112} />
    </Stack>
  );
}

/** 用于渲染可操作读取失败且不暴露不可访问元数据。 */
function OverviewFailure({ error, retry }: { error: KnowledgeApiFailure; retry: () => void }) {
  const notFound = error.code === 'NOT_FOUND';
  return (
    <Alert
      color="danger"
      icon={<AlertCircleIcon aria-hidden="true" size={ICON_SIZE} />}
      title={notFound ? '知识库不可访问' : '知识库未加载'}
    >
      <p className={styles['alert-message']}>{error.message}</p>
      {isRetryable(error) && (
        <Button
          className={styles['alert-action']}
          leftSection={<RefreshCwIcon aria-hidden="true" size={16} />}
          onClick={retry}
          size="compact-sm"
          variant="light"
        >
          重新读取
        </Button>
      )}
    </Alert>
  );
}

/** 用于渲染持久化概览及明确的文档能力边界。 */
function OverviewContent({ data }: { data: KnowledgeBaseSummary }) {
  return (
    <section aria-labelledby="knowledge-overview-title" className={styles['overview-section']}>
      <Title id="knowledge-overview-title" order={2} size="h4">
        知识库概览
      </Title>
      <Text c="dimmed">
        文档树、Inbox 与回收站将在对应施工任务中接入；当前版本用于确认知识库元数据。
      </Text>
      <Group gap="xs">
        <Text size="sm">{data.documentCount} 篇文档</Text>
      </Group>
    </section>
  );
}

/** 用于解析可见标题。 */
function resolveTitle(state: DestinationState): string | undefined {
  if (state.data) return state.data.name;
  return state.error ? '无法打开知识库' : undefined;
}

/** 用于解析标题说明。 */
function resolveLead(state: DestinationState): string | undefined {
  const description = state.data?.description;
  if (!description) return undefined;
  return description;
}

/** 用于渲染详情页操作区。 */
function DestinationActions(props: {
  data: KnowledgeBaseSummary | undefined;
  desktop: boolean;
  offline: boolean;
  onSaved: (data: KnowledgeBaseSummary) => void;
}) {
  const { data, desktop, offline, onSaved } = props;
  if (!desktop || !data) return null;
  return <KnowledgeManagement data={data} offline={offline} onSaved={onSaved} />;
}

/** 用于渲染返回列表的页头返回入口。 */
function BackToKnowledge() {
  return (
    <Link className={styles['back-link']} href="/knowledge">
      <ArrowLeftIcon aria-hidden="true" size={ICON_SIZE} />
      返回列表
    </Link>
  );
}

/** 用于渲染支持桌面管理和移动阅读的真实知识库概览。 */
export function KnowledgeDestination({ knowledgeBaseId }: KnowledgeDestinationProps) {
  const [state, retry, apply] = useKnowledgeSummary(knowledgeBaseId);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const online = useOnline();
  const title = resolveTitle(state);
  return (
    <PageShell
      actions={
        <DestinationActions
          data={state.data}
          desktop={desktop ?? false}
          offline={!online}
          onSaved={apply}
        />
      }
      eyebrow="Everlearn · 知识库"
      lead={resolveLead(state)}
      title={
        title ? (
          <h1 data-page-title tabIndex={-1}>
            {title}
          </h1>
        ) : (
          <Skeleton aria-label="正在加载知识库" height={43} width={260} />
        )
      }
    >
      <BackToKnowledge />
      <main aria-label="知识库内容">
        {state.loading ? (
          <OverviewSkeleton />
        ) : state.error ? (
          <OverviewFailure error={state.error} retry={retry} />
        ) : state.data ? (
          <OverviewContent data={state.data} />
        ) : null}
      </main>
    </PageShell>
  );
}
