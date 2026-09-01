/** @fileoverview 以安静分隔列表渲染搜索结果、高亮与恢复状态。 */

import type { ReactNode } from 'react';
import { FileSearchIcon, RefreshCwIcon } from 'lucide-react';
import Link from 'next/link';

import type { SearchHighlightSegment, SearchResultItem } from '@everlearn/contracts';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Separator,
  Skeleton,
} from '@everlearn/ui';

import { EmptyState } from '../../shared/empty-state';
import { formatDateTime } from '../../shared/format-datetime';
import { LoadFailure } from '../../shared/load-failure';
import { SEARCH_COPY } from './copy';
import type { SearchResultsController } from './use-search-results';

interface SearchResultsProps {
  readonly allowRequests: boolean;
  readonly hasQuery: boolean;
  readonly onRefresh: () => void;
  readonly onZeroAction: () => void;
  readonly results: SearchResultsController;
  readonly zeroActionLabel: string;
}

/** 用于逐段渲染服务端批准的纯文本高亮，不创建 HTML 注入通道。 */
function HighlightText({ segments }: { segments: readonly SearchHighlightSegment[] }) {
  return segments.map((segment, index) =>
    segment.highlighted ? (
      <mark className="rounded-sm bg-accent px-0.5 text-accent-foreground" key={index}>
        {segment.text}
      </mark>
    ) : (
      <span key={index}>{segment.text}</span>
    ),
  );
}

/** 用于生成标题或稳定 Block 定位的真实文档链接。 */
function resultHref(item: SearchResultItem): string {
  const base = `/knowledge/${item.knowledgeBaseId}/documents/${item.documentId}`;
  if (item.blockId === null) return base;
  const params = new URLSearchParams({
    searchBlockId: item.blockId,
    searchDocumentVersion: String(item.documentVersion),
  });
  return `${base}?${params.toString()}`;
}

/** 用于描述标题、正文或同时命中的公开语义。 */
function matchedLabel(item: SearchResultItem): string {
  if (item.matchedField === 'title') return '标题';
  if (item.matchedField === 'content') return '正文';
  return '标题与正文';
}

/** 用于渲染安全展示型祖先路径。 */
function AncestorPath({ item }: { item: SearchResultItem }) {
  if (item.ancestors.length === 0) return null;
  const text = item.ancestors.map((ancestor) => ancestor.title).join(' / ');
  return (
    <p className="m-0 truncate text-xs text-muted-foreground">
      {item.pathTruncated ? '… / ' : ''}
      {text}
    </p>
  );
}

/** 用于渲染正文命中摘要与标题路径。 */
function ContentMatch({ item }: { item: SearchResultItem }) {
  if (item.contentSnippet === null) return null;
  return (
    <div className="grid gap-1">
      {item.headingPath.length > 0 && (
        <p className="m-0 truncate text-xs text-muted-foreground">{item.headingPath.join(' / ')}</p>
      )}
      <p className="m-0 line-clamp-3 text-sm text-muted-foreground">
        {item.contentSnippet.leadingTruncated ? '…' : ''}
        <HighlightText segments={item.contentSnippet.segments} />
        {item.contentSnippet.trailingTruncated ? '…' : ''}
      </p>
    </div>
  );
}

/** 用于渲染一项可键盘访问的搜索结果。 */
function SearchResultRow({ item }: { item: SearchResultItem }) {
  return (
    <article className="grid min-w-0 gap-2 py-5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Badge variant="outline">{item.knowledgeBaseName}</Badge>
        <Badge variant="secondary">{matchedLabel(item)}</Badge>
        <span className="text-xs text-muted-foreground">{formatDateTime(item.updatedAt)}</span>
      </div>
      <AncestorPath item={item} />
      <Link
        className="w-fit max-w-full text-title-small font-semibold text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        href={resultHref(item)}
      >
        <HighlightText segments={item.titleSegments} />
      </Link>
      <ContentMatch item={item} />
    </article>
  );
}

/** 用于镜像五行最终结果列表而不阻塞输入。 */
function SearchResultSkeleton() {
  return (
    <div aria-label="正在加载搜索结果" className="grid gap-5 py-4" role="status">
      {Array.from({ length: 5 }, (_, index) => (
        <div className="grid gap-2" key={index}>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}

/** 用于呈现空查询、零结果或离线冷启动的结构化空态。 */
export function SearchEmpty(props: {
  readonly action?: ReactNode;
  readonly description: string;
  readonly title: string;
}) {
  return (
    <EmptyState
      action={props.action}
      description={props.description}
      icon={FileSearchIcon}
      title={props.title}
    />
  );
}

/** 用于呈现已有结果及范围级索引状态。 */
function ResultList(props: Pick<SearchResultsProps, 'allowRequests' | 'onRefresh' | 'results'>) {
  const { results } = props;
  return (
    <>
      {results.indexStatus === 'updating' && (
        <Alert className="mt-4">
          <RefreshCwIcon aria-hidden="true" />
          <AlertTitle>{SEARCH_COPY.indexUpdating}</AlertTitle>
          <AlertDescription>
            <p className="m-0">当前版本结果可继续查看，刷新可检查最新索引进度。</p>
            <Button
              disabled={!props.allowRequests}
              onClick={props.onRefresh}
              size="sm"
              variant="outline"
            >
              刷新结果
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {/* 离线时保留已有结果并提供手动刷新入口，避免新请求；索引更新中由上方提示承载按钮。 */}
      {!props.allowRequests && results.indexStatus !== 'updating' && (
        <Button className="mt-4" disabled onClick={props.onRefresh} size="sm" variant="outline">
          刷新结果
        </Button>
      )}
      <ul className="m-0 list-none p-0">
        {results.items.map((item) => (
          <li key={item.documentId}>
            <SearchResultRow item={item} />
            <Separator />
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="sr-only">
        已加载 {results.items.length} 条搜索结果
        {results.indexStatus === 'updating' ? '，索引更新中' : ''}
      </p>
    </>
  );
}

/** 用于渲染首屏失败且只允许可恢复失败重试。 */
function SearchResultFailure(props: SearchResultsProps) {
  const retryable =
    props.allowRequests &&
    (!props.results.error?.code || props.results.error.code === 'INTERNAL_ERROR');
  return (
    <LoadFailure
      description={props.results.error?.message ?? '请稍后重试。'}
      {...(retryable ? { onRetry: props.results.refresh } : {})}
      title={SEARCH_COPY.firstPageFailure}
    />
  );
}

/** 用于渲染已有结果、游标读取和局部分页失败。 */
function SearchResultReady(props: SearchResultsProps) {
  const { results } = props;
  return (
    <>
      <ResultList
        allowRequests={props.allowRequests}
        onRefresh={props.onRefresh}
        results={results}
      />
      {results.pageError && (
        <LoadFailure
          description={results.pageError.message}
          {...(props.allowRequests ? { onRetry: results.retryPage } : {})}
          title={SEARCH_COPY.pagingFailure}
        />
      )}
      {!results.pageError && results.nextCursor && (
        <Button
          className="mt-4"
          disabled={!props.allowRequests || results.paging}
          onClick={results.loadMore}
          variant="outline"
        >
          {results.paging ? '正在加载更多结果' : '加载更多'}
        </Button>
      )}
      {results.paging && <Skeleton aria-label="正在加载更多结果" className="mt-4 h-16 w-full" />}
    </>
  );
}

/** 用于同时表达索引仍更新与当前版本零结果。 */
function SearchResultZero(props: SearchResultsProps) {
  return (
    <>
      <ResultList
        allowRequests={props.allowRequests}
        onRefresh={props.onRefresh}
        results={props.results}
      />
      <SearchEmpty
        action={<Button onClick={props.onZeroAction}>{props.zeroActionLabel}</Button>}
        description={SEARCH_COPY.zeroDescription}
        title={SEARCH_COPY.zeroTitle}
      />
    </>
  );
}

/** 用于组合搜索结果区的全部异步状态。 */
export function SearchResults(props: SearchResultsProps) {
  const { results } = props;
  if (!props.hasQuery)
    return (
      <SearchEmpty description={SEARCH_COPY.emptyDescription} title={SEARCH_COPY.emptyTitle} />
    );
  if (results.status === 'loading' && results.items.length === 0) return <SearchResultSkeleton />;
  if (results.status === 'failed') return <SearchResultFailure {...props} />;
  if (results.status === 'ready' && results.items.length === 0)
    return <SearchResultZero {...props} />;
  return results.items.length > 0 ? <SearchResultReady {...props} /> : null;
}
