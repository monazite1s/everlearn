/**
 * @fileoverview 条目详情右侧 Sheet：处理后正文、外链与「处理过程」折叠区。
 */

'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { AlertTriangleIcon, ExternalLinkIcon } from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from '@everlearn/ui';

import type { NewsItemDetail } from './news-api';
import { digestStatusLabel, streamSourceLabel } from './news-format';
import { TopicDot } from './news-item-marks';
import { useNewsItemDetail, useNewsRunDetail } from './use-news-item-detail';
import type { ItemDetailState } from './use-news-item-detail';
import { formatDateTime } from '../../shared/format-datetime';
import { LoadFailure } from '../../shared/load-failure';

const IMPORTANCE_TEXT: Record<NewsItemDetail['importance'], string> = {
  high: '重要性：高',
  low: '重要性：低',
  normal: '重要性：普通',
};

/** 用于渲染发现运行的来源决策、跳过原因与质量警告。 */
function RunDecisions(props: { open: boolean; runId: string | undefined }) {
  const run = useNewsRunDetail(props.open, props.runId);
  if (!props.open || props.runId === undefined) return null;
  if (run.status === 'loading')
    return <p className="m-0 text-sm text-muted-foreground">正在读取处理过程…</p>;
  if (run.status === 'failed')
    return (
      <LoadFailure
        description={run.message ?? '请稍后重试。'}
        onRetry={run.retry}
        title="处理过程读取失败"
      />
    );
  if (run.run === undefined) return null;
  return (
    <div className="grid gap-3">
      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline">运行状态：{digestStatusLabel(run.run.status)}</Badge>
        <Badge variant="outline">来源决策 {run.run.sourceResults.length} 条</Badge>
      </span>
      {run.run.warnings.length > 0 && (
        <Alert>
          <AlertTriangleIcon aria-hidden="true" />
          <AlertTitle>本轮处理有质量警告</AlertTitle>
          <AlertDescription>
            <ul className="m-0 list-disc pl-4">
              {run.run.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <ul className="m-0 grid list-none gap-2 p-0">
        {run.run.sourceResults.map((result) => (
          <li className="grid gap-0.5" key={`${result.url}-${result.decision}`}>
            <span className="flex items-center gap-2 text-sm">
              <Badge variant={result.decision === 'adopted' ? 'secondary' : 'outline'}>
                {result.decision === 'adopted' ? '已采纳' : '已跳过'}
              </Badge>
              <span className="truncate text-foreground">{result.title}</span>
            </span>
            <span className="text-xs text-muted-foreground">{result.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 用于渲染「处理过程」原生折叠区，展开时按需读取运行详情。 */
function ProcessSection(props: { relevance: NewsItemDetail['relevance']; runId: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="rounded-md border border-border px-4 py-3"
      /** 用于跟踪折叠区开合以触发按需读取。 */
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm font-medium text-foreground">处理过程</summary>
      <div className="mt-3 grid gap-3">
        <p className="m-0 text-xs text-muted-foreground">
          相关性判定：{props.relevance === 'accepted' ? '相关，已采纳进入条目流' : '无关'}
        </p>
        {props.runId === null ? (
          <p className="m-0 text-sm text-muted-foreground">该条目没有关联的运行记录。</p>
        ) : (
          <RunDecisions open={open} runId={props.runId} />
        )}
      </div>
    </details>
  );
}

/** 用于渲染就绪详情的元信息、正文段落与操作行。 */
function SheetBody(props: {
  detail: NewsItemDetail;
  onViewTopic: (subscriptionId: string) => void;
}) {
  const { detail } = props;
  return (
    <div className="grid gap-5 overflow-y-auto px-4 pb-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <TopicDot slot={detail.colorSlot} />
          {detail.topic}
        </span>
        <Badge variant="outline">{streamSourceLabel(detail.sourceType)}</Badge>
        <time dateTime={detail.discoveredAt}>{formatDateTime(detail.discoveredAt)}</time>
        <span>{IMPORTANCE_TEXT[detail.importance]}</span>
      </div>
      <div className="grid gap-3">
        {detail.processedContent
          .split(/\n{2,}/u)
          .map((paragraph) => paragraph.trim())
          .filter((paragraph) => paragraph.length > 0)
          .map((paragraph, index) => (
            <p className="m-0 text-sm leading-relaxed text-foreground" key={index}>
              {paragraph}
            </p>
          ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild>
          <a href={detail.url} rel="noreferrer noopener" target="_blank">
            <ExternalLinkIcon aria-hidden="true" />
            查看原文
            <span className="sr-only">（在新标签打开外部站点）</span>
          </a>
        </Button>
        <Button onClick={() => props.onViewTopic(detail.subscriptionId)} variant="outline">
          查看主题条目
        </Button>
      </div>
      <ProcessSection relevance={detail.relevance} runId={detail.discoveredRunId} />
    </div>
  );
}

/** 用于渲染详情读取状态与就绪正文。 */
function SheetDetailRegion(props: {
  detail: ItemDetailState;
  onViewTopic: (subscriptionId: string) => void;
}) {
  const { detail } = props;
  if (detail.status === 'loading') {
    return (
      <div aria-label="正在加载条目详情" className="grid gap-3 px-4 py-6" role="status">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-4 w-full" />
      </div>
    );
  }
  if (detail.status === 'unavailable') {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground" role="alert">
        该条目不存在或不可访问。
      </p>
    );
  }
  if (detail.status === 'failed') {
    return (
      <div className="px-4 py-6">
        <LoadFailure
          description={detail.message ?? '请稍后重试。'}
          onRetry={detail.retry}
          title="条目详情加载失败"
        />
      </div>
    );
  }
  if (detail.detail !== undefined) {
    return <SheetBody detail={detail.detail} onViewTopic={props.onViewTopic} />;
  }
  return null;
}

/** 用于渲染条目详情 Sheet 并同步 ?item 深链状态。 */
export function NewsItemSheet(props: {
  itemId: string | undefined;
  onClose: () => void;
  onViewTopic: (subscriptionId: string) => void;
}) {
  const detail = useNewsItemDetail(props.itemId);
  const open = props.itemId !== undefined;
  const triggerRef = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  useLayoutEffect(
    /** 用于在浮层接管焦点前捕获触发行；焦点已在浮层内时不捕获，避免记录随浮层卸载的死元素。 */
    function captureTrigger(): void {
      if (open && !wasOpen.current && document.activeElement instanceof HTMLElement) {
        const insideOverlay = document.activeElement.closest('[role="dialog"]') !== null;
        triggerRef.current = insideOverlay ? null : document.activeElement;
      }
      wasOpen.current = open;
    },
    [open],
  );
  const title = detail.status === 'ready' && detail.detail ? detail.detail.title : '条目详情';
  return (
    <Sheet
      onOpenChange={(next) => {
        if (!next) props.onClose();
      }}
      open={open}
    >
      <SheetContent
        className="w-full! max-w-full! gap-0 p-0 md:w-[42rem]! md:max-w-[42rem]! motion-reduce:animate-none"
        onCloseAutoFocus={(event) => {
          if (triggerRef.current === null) return;
          event.preventDefault();
          triggerRef.current.focus();
        }}
      >
        <SheetHeader className="border-b border-border pr-12">
          <SheetTitle className="text-title-small">{title}</SheetTitle>
          <SheetDescription asChild>
            <span className="text-xs text-muted-foreground">资讯条目的处理后内容与来源决策。</span>
          </SheetDescription>
        </SheetHeader>
        <SheetDetailRegion detail={detail} onViewTopic={props.onViewTopic} />
      </SheetContent>
    </Sheet>
  );
}
