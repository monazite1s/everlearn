/**
 * @fileoverview 简报 tab：最近简报置顶摘要卡与按日历史列表。
 */

'use client';

import { CalendarDaysIcon, TriangleAlertIcon } from 'lucide-react';

import { Badge, Button, Card, CardContent, Skeleton } from '@everlearn/ui';

import type { NewsDigestSummary } from './news-api';
import { digestStatusLabel } from './news-format';
import { useNewsDigests } from './use-news-digests';
import type { NewsDigestsState } from './use-news-digests';
import { EmptyState } from '../../shared/empty-state';
import { LoadFailure } from '../../shared/load-failure';

/** 用于把简报日期转换为中文日期文案。 */
function digestDateLabel(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(date);
}

/** 用于计算简报文档路由，缺知识库或文档时返回 null。 */
function digestHref(digest: NewsDigestSummary, fallbackKbId: string | null): string | null {
  if (digest.documentId === null) return null;
  const knowledgeBaseId = digest.knowledgeBaseId ?? fallbackKbId;
  return knowledgeBaseId ? `/knowledge/${knowledgeBaseId}/documents/${digest.documentId}` : null;
}

/** 用于渲染质量警告徽标。 */
function WarningBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Badge className="gap-1" variant="outline">
      <TriangleAlertIcon aria-hidden="true" />
      {count} 项警告
    </Badge>
  );
}

/** 用于渲染最近一份简报的置顶摘要卡。 */
function DigestSummaryCard(props: { digest: NewsDigestSummary; href: string | null }) {
  const { digest } = props;
  return (
    <Card className="mt-4">
      <CardContent className="grid gap-3">
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <CalendarDaysIcon aria-hidden="true" />
          {digestDateLabel(digest.digestDate)}
          <Badge variant="outline">{digestStatusLabel(digest.status)}</Badge>
          <WarningBadge count={digest.warningCount} />
        </span>
        <h2 className="m-0 font-serif text-title-small text-foreground">{digest.title}</h2>
        <span className="text-sm text-muted-foreground">聚合 {digest.itemCount} 条资讯条目</span>
        {props.href ? (
          <Button asChild className="w-fit">
            <a href={props.href}>打开简报</a>
          </Button>
        ) : (
          <p className="m-0 text-xs text-muted-foreground">简报文档尚未生成，稍后可再打开。</p>
        )}
      </CardContent>
    </Card>
  );
}

/** 用于渲染一条可进入文档路由的按日简报行。 */
function DigestRow(props: { digest: NewsDigestSummary; href: string | null }) {
  const { digest } = props;
  const meta = (
    <>
      <span className="text-xs text-muted-foreground">{digestDateLabel(digest.digestDate)}</span>
      <Badge variant="outline">{digestStatusLabel(digest.status)}</Badge>
      <WarningBadge count={digest.warningCount} />
    </>
  );
  if (props.href === null) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3">
        <span className="text-sm text-muted-foreground">{digest.title}</span>
        <span className="flex items-center gap-2">{meta}</span>
      </li>
    );
  }
  return (
    <li className="list-none">
      <a
        className="flex flex-wrap items-center justify-between gap-2 rounded-xs border-b border-border py-3 underline-offset-4 transition-colors duration-150 hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none hover:underline"
        href={props.href}
      >
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{digest.title}</span>
        <span className="flex items-center gap-2">{meta}</span>
      </a>
    </li>
  );
}

/** 用于挑选信息量最大的已生成简报置顶：优先已有文档，其次聚合条目更多。 */
function pickFeatured(items: readonly NewsDigestSummary[]): NewsDigestSummary | undefined {
  return [...items].sort(
    (left, right) =>
      Number(right.documentId !== null) - Number(left.documentId !== null) ||
      right.itemCount - left.itemCount,
  )[0];
}

/** 用于渲染就绪简报的置顶卡、按日列表与分页。 */
function DigestsReady(props: {
  fallbackKnowledgeBaseId: string | null;
  loadMore: () => void;
  nextCursor: string | null;
  online: boolean;
  paging: boolean;
  state: NewsDigestsState;
}) {
  const latest = pickFeatured(props.state.items);
  if (latest === undefined) return null;
  return (
    <>
      <DigestSummaryCard digest={latest} href={digestHref(latest, props.fallbackKnowledgeBaseId)} />
      <section aria-label="按日简报列表" className="mt-6">
        <ul className="m-0 grid p-0">
          {props.state.items.map((digest) => (
            <DigestRow
              digest={digest}
              href={digestHref(digest, props.fallbackKnowledgeBaseId)}
              key={digest.id}
            />
          ))}
        </ul>
        {props.nextCursor !== null && (
          <Button
            className="mt-4"
            disabled={!props.online || props.paging}
            onClick={props.loadMore}
            variant="outline"
          >
            {props.paging ? '正在加载更多简报' : '加载更多'}
          </Button>
        )}
      </section>
    </>
  );
}

/** 用于组合简报 tab 的置顶卡、按日列表与恢复状态。 */
export function NewsDigestsTab(props: {
  active: boolean;
  fallbackKnowledgeBaseId: string | null;
  online: boolean;
}) {
  const state = useNewsDigests(props.active, props.online);
  const ready = state.status === 'ready' && state.items.length > 0;
  return (
    <div className="grid gap-2">
      {state.status === 'loading' && (
        <div aria-label="正在读取简报" className="grid gap-4" role="status">
          <Skeleton className="h-36 w-full rounded-xl" />
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton className="h-10 w-full" key={index} />
          ))}
        </div>
      )}
      {state.status === 'failed' && (
        <LoadFailure
          description={state.message ?? '请稍后重试。'}
          onRetry={state.retry}
          title="无法读取简报"
        />
      )}
      {state.status === 'ready' && state.items.length === 0 && (
        <EmptyState
          description="简报由订阅按计划聚合条目生成，创建订阅并等待首次运行后即可在这里回顾。"
          icon={CalendarDaysIcon}
          title="还没有简报"
        />
      )}
      {ready && (
        <DigestsReady
          fallbackKnowledgeBaseId={props.fallbackKnowledgeBaseId}
          loadMore={state.loadMore}
          nextCursor={state.nextCursor}
          online={props.online}
          paging={state.paging}
          state={state}
        />
      )}
    </div>
  );
}
