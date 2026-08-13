/** @fileoverview Renders the minimal real destination required after knowledge-base creation. */

'use client';

import { Alert, Button, Group, Skeleton, Stack, Text, Title } from '@mantine/core';
import type { KnowledgeBaseSummary } from '@everlearn/contracts';
import { AlertCircleIcon, ArrowLeftIcon, BookOpenIcon, RefreshCwIcon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { getKnowledgeBase } from './knowledge-api';
import type { KnowledgeApiFailure } from './knowledge-api';
import styles from './knowledge-page.module.css';

interface KnowledgeDestinationProps {
  knowledgeBaseId: string;
}

interface DestinationState {
  readonly data?: KnowledgeBaseSummary;
  readonly error?: KnowledgeApiFailure;
  readonly loading: boolean;
}

const ICON_SIZE = 18;

/** Starts and cancels the detail read when the route identity changes. */
function useKnowledgeSummary(knowledgeBaseId: string): [DestinationState, () => void] {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DestinationState>({ loading: true });
  useEffect(
    /** Synchronizes one visible knowledge-base summary from the same-origin API. */
    function synchronizeSummary(): () => void {
      let active = true;
      void getKnowledgeBase(knowledgeBaseId).then(
        /** Applies only a response that still belongs to the mounted route. */
        function applyIfActive(result): void {
          if (!active) return;
          setState(
            result.ok
              ? { data: result.data, loading: false }
              : { error: result.error, loading: false },
          );
        },
      );
      return /** Prevents stale route responses from changing visible state. */ function cancel(): void {
        active = false;
      };
    },
    [attempt, knowledgeBaseId],
  );
  /** Starts a new detail read without replacing the route. */
  function retry(): void {
    setState({ loading: true });
    setAttempt((current) => current + 1);
  }
  return [state, retry];
}

/** Renders loading, failure, or persisted detail content for one destination. */
function DestinationContent({ retry, state }: { retry: () => void; state: DestinationState }) {
  if (state.loading) {
    return (
      <Stack aria-label="正在加载知识库摘要" gap="sm">
        <Skeleton height={20} width="60%" />
        <Skeleton height={96} />
      </Stack>
    );
  }
  if (state.error) {
    return (
      <Alert
        color="red"
        icon={<AlertCircleIcon aria-hidden="true" size={ICON_SIZE} />}
        title={state.error.code === 'NOT_FOUND' ? '知识库不可访问' : '知识库未加载'}
      >
        <Text size="sm">{state.error.message}</Text>
        <Button
          leftSection={<RefreshCwIcon aria-hidden="true" size={16} />}
          mt="sm"
          onClick={retry}
          size="compact-sm"
          variant="light"
        >
          重新读取
        </Button>
      </Alert>
    );
  }
  if (!state.data) return null;
  return (
    <Stack gap="lg">
      <Text c="dimmed">{state.data.description || '还没有说明。'}</Text>
      <Group gap="xs">
        <BookOpenIcon aria-hidden="true" size={ICON_SIZE} />
        <Text>{state.data.documentCount} 篇文档</Text>
      </Group>
      {state.data.documentCount === 0 && (
        <Alert icon={<BookOpenIcon aria-hidden="true" size={ICON_SIZE} />} title="知识库已创建">
          文档树将在下一项施工任务接入；当前知识库已经持久化，可以安全刷新或返回列表。
        </Alert>
      )}
    </Stack>
  );
}

/** Renders a read-only persisted summary without pre-empting later management features. */
export function KnowledgeDestination({ knowledgeBaseId }: KnowledgeDestinationProps) {
  const [state, retry] = useKnowledgeSummary(knowledgeBaseId);
  const title = state.data?.name ?? (state.error ? '无法打开知识库' : undefined);
  return (
    <article className={styles.page}>
      <header className={styles.header}>
        <div>
          <Text className={styles.eyebrow}>Everlearn · 知识库</Text>
          {title ? (
            <Title data-page-title order={1} tabIndex={-1}>
              {title}
            </Title>
          ) : (
            <Skeleton aria-label="正在加载知识库" height={43} width={260} />
          )}
        </div>
        <Button
          component={Link}
          href="/knowledge"
          leftSection={<ArrowLeftIcon aria-hidden="true" size={ICON_SIZE} />}
          variant="subtle"
        >
          返回列表
        </Button>
      </header>
      <section aria-label="知识库摘要" className={styles.content}>
        <DestinationContent retry={retry} state={state} />
      </section>
    </article>
  );
}
