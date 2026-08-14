/** @fileoverview Renders the persisted knowledge-base overview and desktop management flow. */

'use client';

import { Alert, Button, Group, Skeleton, Stack, Text, Title } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import type { KnowledgeBaseSummary } from '@everlearn/contracts';
import { AlertCircleIcon, ArrowLeftIcon, BookOpenIcon, RefreshCwIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';

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
const KnowledgeManagement = dynamic(
  () => import('./knowledge-management').then((module) => module.KnowledgeManagement),
  { ssr: false },
);

/** Starts and cancels detail reads while exposing an authoritative refresh action. */
function useKnowledgeSummary(
  knowledgeBaseId: string,
): [DestinationState, () => void, (data: KnowledgeBaseSummary) => void] {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DestinationState>({
    loading: true,
    resourceId: knowledgeBaseId,
  });
  useEffect(
    /** Synchronizes one visible summary from the same-origin API. */
    function synchronizeSummary(): () => void {
      let active = true;
      void getKnowledgeBase(knowledgeBaseId).then(
        /** Applies only the response belonging to the mounted route. */
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
  /** Starts a new authoritative detail read. */
  function retry(): void {
    setState({ loading: true, resourceId: knowledgeBaseId });
    setAttempt((current) => current + 1);
  }
  /** Replaces visible data only after a confirmed API response. */
  function apply(data: KnowledgeBaseSummary): void {
    setState({ data, loading: false, resourceId: knowledgeBaseId });
  }
  const visibleState =
    state.resourceId === knowledgeBaseId ? state : { loading: true, resourceId: knowledgeBaseId };
  return [visibleState, retry, apply];
}

/** Renders a layout-stable overview loading state. */
function OverviewSkeleton() {
  return (
    <Stack aria-label="正在加载知识库摘要" gap="sm">
      <Skeleton height={20} width="60%" />
      <Skeleton height={112} />
    </Stack>
  );
}

/** Renders an actionable read failure without exposing inaccessible metadata. */
function OverviewFailure({ error, retry }: { error: KnowledgeApiFailure; retry: () => void }) {
  return (
    <Alert
      color="red"
      icon={<AlertCircleIcon aria-hidden="true" size={ICON_SIZE} />}
      title={error.code === 'NOT_FOUND' ? '知识库不可访问' : '知识库未加载'}
    >
      <Text size="sm">{error.message}</Text>
      {error.code !== 'NOT_FOUND' && (
        <Button
          leftSection={<RefreshCwIcon aria-hidden="true" size={16} />}
          mt="sm"
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

/** Renders persisted overview content and an honest document capability boundary. */
function OverviewContent({ data }: { data: KnowledgeBaseSummary }) {
  return (
    <section aria-labelledby="knowledge-overview-title" className={styles.overviewSection}>
      <Title id="knowledge-overview-title" order={2} size="h4">
        知识库概览
      </Title>
      <Text c="dimmed">{data.description || '还没有说明。'}</Text>
      <Group gap="xs">
        <BookOpenIcon aria-hidden="true" size={ICON_SIZE} />
        <Text>{data.documentCount} 篇文档</Text>
      </Group>
    </section>
  );
}

/** Renders the real knowledge-base overview with desktop management and mobile reading. */
export function KnowledgeDestination({ knowledgeBaseId }: KnowledgeDestinationProps) {
  const [state, retry, apply] = useKnowledgeSummary(knowledgeBaseId);
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const title = state.data?.name ?? (state.error ? '无法打开知识库' : undefined);
  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <Text className={styles.eyebrow}>Everlearn · 知识库</Text>
          {title ? (
            <Title data-page-title order={1} tabIndex={-1}>
              {title}
            </Title>
          ) : (
            <Skeleton aria-label="正在加载知识库" height={43} width={260} />
          )}
        </div>
        <Group className={styles.headerActions} gap="xs">
          {desktop && state.data && <KnowledgeManagement data={state.data} onSaved={apply} />}
          <Button
            component={Link}
            href="/knowledge"
            leftSection={<ArrowLeftIcon aria-hidden="true" size={ICON_SIZE} />}
            variant="subtle"
          >
            返回列表
          </Button>
        </Group>
      </header>
      <main aria-label="知识库内容" className={styles.content}>
        {state.loading && <OverviewSkeleton />}
        {state.error && <OverviewFailure error={state.error} retry={retry} />}
        {state.data && <OverviewContent data={state.data} />}
      </main>
    </article>
  );
}
