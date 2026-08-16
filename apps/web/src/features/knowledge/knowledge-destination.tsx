/** @fileoverview 渲染持久化知识库概览和桌面管理流程。 */

'use client';

import type { KnowledgeBaseSummary } from '@everlearn/contracts';
import { ArrowLeftIcon, CalendarClockIcon, FileTextIcon } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { Badge, Button, Skeleton } from '@everlearn/ui';

import { formatDateTime } from '../../shared/format-datetime';
import { LoadFailure } from '../../shared/load-failure';
import { PageShell } from '../../shared/page-shell';
import { SectionCards } from '../../shared/section-cards';
import { useOnline } from '../../shared/use-online';
import { getKnowledgeBase, type KnowledgeApiFailure } from './knowledge-api';

interface KnowledgeDestinationProps {
  knowledgeBaseId: string;
}

interface DestinationState {
  readonly data?: KnowledgeBaseSummary;
  readonly error?: KnowledgeApiFailure;
  readonly loading: boolean;
  readonly resourceId: string;
}

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

/** 用于按媒体查询返回挂载后的稳定匹配结果。 */
function useMediaQuery(query: string): boolean | undefined {
  const subscribe = useCallback(
    /** 用于订阅查询结果变化。 */
    function subscribeMatch(listener: () => void): () => void {
      const media = window.matchMedia(query);
      media.addEventListener('change', listener);
      return function stopSubscribing(): void {
        media.removeEventListener('change', listener);
      };
    },
    [query],
  );
  const getSnapshot = useCallback(
    /** 用于读取当前查询匹配。 */
    function readMatch(): boolean {
      return window.matchMedia(query).matches;
    },
    [query],
  );
  const getServerSnapshot = useCallback(
    /** 用于在服务端渲染期间保持未匹配。 */
    function readServerMatch(): undefined {
      return undefined;
    },
    [],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
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
      return /** 用于丢弃路由或重试切换后的过期响应。 */ function cancel(): void {
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
    <div aria-label="正在加载知识库" className="grid gap-4" role="status">
      <Skeleton className="h-11 w-65" />
      <div className="grid gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {[0, 1].map((index) => (
          <Skeleton className="h-32" key={index} />
        ))}
      </div>
    </div>
  );
}

/** 用于渲染可操作读取失败且不暴露不可访问元数据。 */
function OverviewFailure({ error, retry }: { error: KnowledgeApiFailure; retry: () => void }) {
  const notFound = error.code === 'NOT_FOUND';
  return (
    <LoadFailure
      description={error.message}
      {...(isRetryable(error) ? { onRetry: retry } : {})}
      title={notFound ? '知识库不可访问' : '知识库未加载'}
    />
  );
}

/** 用于渲染持久化概览的统计卡与能力边界说明。 */
function OverviewContent({ data }: { data: KnowledgeBaseSummary }) {
  return (
    <div aria-label="知识库内容" className="grid gap-4 pb-8">
      <SectionCards
        items={[
          {
            hint: '当前知识库内的文档数量',
            icon: FileTextIcon,
            label: '文档',
            value: String(data.documentCount),
          },
          {
            hint: '最近一次内容更新时间',
            icon: CalendarClockIcon,
            label: '最近更新',
            value: formatDateTime(data.updatedAt),
          },
        ]}
      />
      <section aria-labelledby="knowledge-overview-title" className="grid gap-2 pt-2">
        <h2 className="m-0 text-title-small text-foreground" id="knowledge-overview-title">
          知识库概览
        </h2>
        <p className="m-0 text-sm text-muted-foreground">
          文档树、Inbox 与回收站将在对应施工任务中接入；当前版本用于确认知识库元数据。
        </p>
        {data.kind !== 'normal' && (
          <Badge className="w-fit" variant="secondary">
            系统知识库
          </Badge>
        )}
      </section>
    </div>
  );
}

/** 用于解析可见标题。 */
function resolveTitle(state: DestinationState): string | undefined {
  if (state.data) return state.data.name;
  return state.error ? '无法打开知识库' : undefined;
}

/** 用于解析标题说明。 */
function resolveLead(state: DestinationState): string | undefined {
  return state.data?.description;
}

/** 用于渲染详情页操作区的返回入口与桌面管理菜单。 */
function DestinationActions(props: {
  data: KnowledgeBaseSummary | undefined;
  desktop: boolean;
  offline: boolean;
  onSaved: (data: KnowledgeBaseSummary) => void;
}) {
  const { data, desktop, offline, onSaved } = props;
  return (
    <>
      <Button asChild variant="ghost">
        <Link href="/knowledge">
          <ArrowLeftIcon aria-hidden="true" />
          返回列表
        </Link>
      </Button>
      {desktop && data && <KnowledgeManagement data={data} offline={offline} onSaved={onSaved} />}
    </>
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
      lead={resolveLead(state)}
      title={
        title ? (
          <h1 data-page-title tabIndex={-1}>
            {title}
          </h1>
        ) : (
          <Skeleton className="h-11 w-65" />
        )
      }
    >
      <main aria-label="知识库内容" className="pb-8">
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
