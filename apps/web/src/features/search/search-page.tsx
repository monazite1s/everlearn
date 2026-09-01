/** @fileoverview 组合可深链的全局搜索页面、范围校验与结果恢复状态。 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button, Separator } from '@everlearn/ui';

import { LoadFailure } from '../../shared/load-failure';
import { OfflineNotice } from '../../shared/offline-notice';
import { PageShell } from '../../shared/page-shell';
import { useOnline } from '../../shared/use-online';
import { SEARCH_COPY } from './copy';
import { SearchControls } from './search-controls';
import { SearchEmpty, SearchResults } from './search-results';
import { buildSearchHref, parseSearchFilters, type SearchFilters } from './search-url';
import { useSearchResults, type SearchResultsController } from './use-search-results';
import { useSearchScope, type ScopeLoad } from './use-search-scope';

/** 搜索页面的可序列化首屏参数与壳导航动作。 */
export interface SearchPageProps {
  readonly initialSearchParams: string;
  readonly onLeave: () => void;
}

interface SearchPageController {
  readonly changeFilters: (next: SearchFilters) => void;
  readonly filters: SearchFilters;
  readonly onLeave: () => void;
  readonly online: boolean;
  readonly recoverZero: () => void;
  readonly results: SearchResultsController;
  readonly retryScope: () => void;
  readonly scope: ScopeLoad;
  readonly searchAll: () => void;
}

/** 用于构造切换到全部知识库范围的状态。 */
function allScope(filters: SearchFilters): SearchFilters {
  return {
    field: filters.field,
    query: filters.query,
    scope: 'all',
    updatedWithin: filters.updatedWithin,
  };
}

/** 用于让未被子浮层消费的 Escape 复用壳离开动作。 */
function useLeaveOnEscape(onLeave: () => void): void {
  useEffect(
    /** 用于绑定页面级 Escape。 */
    function bindEscape(): () => void {
      /** 用于忽略输入法和已消费事件后离开搜索。 */
      function handleEscape(event: KeyboardEvent): void {
        if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) onLeave();
      }
      window.addEventListener('keydown', handleEscape);
      return /** 用于解除页面级 Escape。 */ function unbindEscape(): void {
        window.removeEventListener('keydown', handleEscape);
      };
    },
    [onLeave],
  );
}

/** 用于在异步范围首次就绪且用户未主动操作时补交搜索焦点。 */
function useFocusAfterScopeReady(scope: ScopeLoad): void {
  const previous = useRef(scope.status);
  useEffect(() => {
    const becameReady = previous.current === 'loading' && scope.status === 'ready';
    previous.current = scope.status;
    if (!becameReady || document.activeElement !== document.body) return;
    document.querySelector<HTMLInputElement>('[data-route-focus]')?.focus();
  }, [scope.status]);
}

/** 用于执行零结果唯一恢复动作。 */
function recoverZeroResults(filters: SearchFilters, change: (next: SearchFilters) => void): void {
  if (filters.scope === 'knowledgeBase') return change(allScope(filters));
  if (filters.field !== 'all' || filters.updatedWithin !== 'any') {
    change({ ...filters, field: 'all', updatedWithin: 'any' });
    return;
  }
  const input = document.querySelector<HTMLInputElement>('[data-route-focus]');
  input?.focus();
  input?.select();
}

/** 用于聚合搜索页本地筛选、范围和结果控制器。 */
function useSearchPageController(props: SearchPageProps): SearchPageController {
  const router = useRouter();
  const online = useOnline();
  const [filters, setFilters] = useState(() => parseSearchFilters(props.initialSearchParams));
  const [scope, retryScope] = useSearchScope(filters, online);
  const scopeReady = scope.status === 'all' || scope.status === 'ready';
  const results = useSearchResults({ enabled: scopeReady, filters, online });
  useLeaveOnEscape(props.onLeave);
  useFocusAfterScopeReady(scope);
  /** 用于同步本地输入与可分享 URL，且不污染历史栈。 */
  function changeFilters(next: SearchFilters): void {
    setFilters(next);
    router.replace(buildSearchHref(next));
  }
  const searchAll = /** 用于清除当前库身份并保留其余筛选。 */ (): void =>
    changeFilters(allScope(filters));
  const recoverZero = /** 用于恢复零结果。 */ (): void =>
    recoverZeroResults(filters, changeFilters);
  return {
    changeFilters,
    filters,
    onLeave: props.onLeave,
    online,
    recoverZero,
    results,
    retryScope,
    scope,
    searchAll,
  };
}

/** 用于计算零结果唯一主行动文案。 */
function zeroActionLabel(filters: SearchFilters): string {
  if (filters.scope === 'knowledgeBase') return '搜索全部知识库';
  if (filters.field !== 'all' || filters.updatedWithin !== 'any') return '清除筛选';
  return '调整搜索词';
}

/** 用于渲染范围、离线与结果请求的互斥状态。 */
function SearchStatusRegion(props: SearchPageController & { readonly unavailable: boolean }) {
  if (props.scope.status === 'failed') {
    return (
      <LoadFailure
        description={props.scope.message}
        onRetry={props.retryScope}
        title="搜索范围未加载"
      />
    );
  }
  if (props.unavailable) return <UnavailableScope onSearchAll={props.searchAll} />;
  if (props.scope.status === 'offline') return <OfflineSearchEmpty />;
  if (props.scope.status === 'loading') return null;
  if (!props.online && props.results.items.length === 0) return <OfflineSearchEmpty />;
  return (
    <SearchResults
      allowRequests={props.online}
      hasQuery={props.filters.query.trim().length > 0}
      onRefresh={props.results.refresh}
      onZeroAction={props.recoverZero}
      results={props.results}
      zeroActionLabel={zeroActionLabel(props.filters)}
    />
  );
}

/** 用于渲染不可访问范围的统一无泄漏状态。 */
function UnavailableScope({ onSearchAll }: { readonly onSearchAll: () => void }) {
  return (
    <SearchEmpty
      action={<Button onClick={onSearchAll}>搜索全部知识库</Button>}
      description={SEARCH_COPY.scopeUnavailableDescription}
      title={SEARCH_COPY.scopeUnavailableTitle}
    />
  );
}

/** 用于渲染没有可复用缓存时的离线冷启动。 */
function OfflineSearchEmpty() {
  return (
    <SearchEmpty
      description={SEARCH_COPY.offlineEmptyDescription}
      title={SEARCH_COPY.offlineEmptyTitle}
    />
  );
}

/** 用于渲染全局搜索结果层并保持 URL 为唯一可分享状态。 */
export function SearchPage(props: SearchPageProps) {
  const page = useSearchPageController(props);
  const unavailable =
    page.scope.status === 'unavailable' ||
    (page.filters.scope === 'knowledgeBase' && page.results.error?.code === 'NOT_FOUND');
  const scopeName =
    page.scope.status === 'ready' && !unavailable ? page.scope.knowledgeBase.name : undefined;
  return (
    <PageShell
      lead="在文档标题和正文中查找已保存的知识。"
      title={
        <h1 data-page-title tabIndex={-1}>
          搜索
        </h1>
      }
    >
      <Button className="mb-4 w-fit" onClick={page.onLeave} variant="ghost">
        <ArrowLeftIcon aria-hidden="true" />
        返回
      </Button>
      <SearchControls
        disabled={page.scope.status === 'loading' || unavailable}
        filters={page.filters}
        onChange={page.changeFilters}
        onLeave={page.onLeave}
        onSearchAll={page.searchAll}
        onSubmit={page.results.submitNow}
        readOnly={!page.online}
        scopeLoading={page.scope.status === 'loading'}
        {...(scopeName ? { scopeName } : {})}
      />
      {!page.online && <OfflineNotice description={SEARCH_COPY.offlineDescription} />}
      <Separator className="my-6" />
      <SearchStatusRegion {...page} unavailable={unavailable} />
    </PageShell>
  );
}
