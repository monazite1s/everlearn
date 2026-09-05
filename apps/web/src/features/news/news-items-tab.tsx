/**
 * @fileoverview 条目流 tab：过滤行、安静分隔列表、j/k 键盘流与全部恢复状态。
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { InboxIcon, PlusIcon } from 'lucide-react';

import { Button, Separator, Skeleton } from '@everlearn/ui';

import type { NewsItemFilters, NewsItemSummary } from './news-api';
import type { SubscriptionsState } from './use-news-data';
import { EmptyState } from '../../shared/empty-state';
import { LoadFailure } from '../../shared/load-failure';
import { NewsItemFiltersBar } from './news-item-filters';
import { NewsItemRow } from './news-item-row';
import { useNewsItems } from './use-news-items';

/** 键盘流需要放行的可编辑或浮层宿主选择器。 */
const KEYBOARD_SKIP_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]';

/** 用于判断按键是否来自输入、IME 或浮层内而必须放行。 */
function blockedKeyboardTarget(event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return true;
  const target = event.target;
  return !(target instanceof Element) || target.closest(KEYBOARD_SKIP_SELECTOR) !== null;
}

/** 用于把按键解析为 roving 动作。 */
function rovingAction(key: string, active: number, count: number): 'next' | 'open' | 'prev' | null {
  if (key === 'j') return 'next';
  if (key === 'k') return active <= 0 ? null : 'prev';
  if (key === 'Enter') return active >= 0 && active < count ? 'open' : null;
  return null;
}

/** 用于把 roving 焦点移动到指定行并滚动跟随。 */
function focusRowAt(list: HTMLElement | null, index: number): void {
  const link = list?.querySelectorAll<HTMLElement>('[data-news-item-link]')[index];
  link?.focus();
  link?.scrollIntoView?.({ block: 'nearest' });
}

/** 用于实现 j/k 在行间移动与 Enter 打开详情的键盘流。 */
function useRovingItems(count: number, onOpenIndex: (index: number) => void) {
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(
    /** 用于绑定页面级 j/k/Enter 键处理。 */
    function bindKeyboard(): () => void {
      /** 用于在非输入、非浮层场景消费 j/k/Enter。 */
      function handleKey(event: KeyboardEvent): void {
        if (blockedKeyboardTarget(event)) return;
        const action = rovingAction(event.key, active, count);
        if (action === null || action === 'open') {
          if (action === 'open' && listRef.current?.contains(document.activeElement)) {
            event.preventDefault();
            onOpenIndex(active);
          }
          return;
        }
        if (count === 0) return;
        event.preventDefault();
        const next = action === 'next' ? Math.min(active + 1, count - 1) : Math.max(active - 1, 0);
        if (next === active) return;
        setActive(next);
        focusRowAt(listRef.current, next);
      }
      window.addEventListener('keydown', handleKey);
      return /** 用于解绑页面级键盘处理。 */ function unbind(): void {
        window.removeEventListener('keydown', handleKey);
      };
    },
    [active, count, onOpenIndex],
  );

  return { active, listRef };
}

/** 用于镜像条目行结构的首屏骨架。 */
function ItemsSkeleton() {
  return (
    <div aria-label="正在加载条目" className="grid" role="status">
      {Array.from({ length: 6 }, (_, index) => (
        <div className="grid gap-2 border-b border-border py-4" key={index}>
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-2 rounded-full" />
            <Skeleton className="h-5 w-2/5" />
            <Skeleton className="ml-auto h-5 w-20" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      ))}
    </div>
  );
}

/** 用于渲染零结果与离线空态并区分是否可清除筛选。 */
function ItemsEmpty(props: {
  filters: NewsItemFilters;
  hasSubscriptions: boolean;
  onChangeFilters: (next: NewsItemFilters) => void;
  onOpenCreate: () => void;
  online: boolean;
}) {
  if (!props.online) {
    return (
      <EmptyState description="当前离线：恢复网络后即可读取最新条目。" title="暂无法读取资讯条目" />
    );
  }
  if (!props.hasSubscriptions) {
    return (
      <EmptyState
        action={
          <Button
            className="hidden md:inline-flex"
            disabled={!props.online}
            onClick={props.onOpenCreate}
          >
            <PlusIcon aria-hidden="true" />
            创建资讯订阅
          </Button>
        }
        description="订阅 RSS 或搜索来源后，采集到的条目会按重要性与时间沉淀在这里，并可聚合为每日简报。"
        icon={InboxIcon}
        title="还没有资讯订阅"
      />
    );
  }
  const clearable =
    props.filters.subscriptionId !== undefined ||
    props.filters.sourceType !== undefined ||
    props.filters.importance !== undefined;
  return (
    <EmptyState
      action={
        clearable ? <Button onClick={() => props.onChangeFilters({})}>清除筛选</Button> : undefined
      }
      description={
        clearable
          ? '当前筛选下没有条目，可清除筛选后重读。'
          : '当前时间窗口内暂无条目，稍后再来看看。'
      }
      title="没有匹配的条目"
    />
  );
}

/** 用于渲染就绪列表、roving 键盘流、游标分页与局部分页失败。 */
function ItemsReady(props: {
  hrefFor: (itemId: string) => string;
  items: readonly NewsItemSummary[];
  loadMore: () => void;
  nextCursor: string | null;
  onOpenItem: (itemId: string) => void;
  online: boolean;
  pageMessage?: string | undefined;
  paging: boolean;
}) {
  const { active, listRef } = useRovingItems(props.items.length, (index) =>
    props.onOpenItem(props.items[index]?.id ?? ''),
  );
  return (
    <>
      <ul className="m-0 grid p-0" ref={listRef}>
        {props.items.map((item, index) => (
          <NewsItemRow
            active={index === active}
            href={props.hrefFor(item.id)}
            item={item}
            key={item.id}
            onOpen={props.onOpenItem}
          />
        ))}
      </ul>
      <p aria-live="polite" className="sr-only">
        已加载 {props.items.length} 条资讯条目
      </p>
      {props.pageMessage !== undefined && (
        <LoadFailure
          description={props.pageMessage}
          onRetry={props.loadMore}
          title="后续条目加载失败"
        />
      )}
      {props.nextCursor !== null && props.pageMessage === undefined && (
        <Button
          className="mt-4"
          disabled={!props.online || props.paging}
          onClick={props.loadMore}
          variant="outline"
        >
          {props.paging ? '正在加载更多条目' : '加载更多'}
        </Button>
      )}
      {props.paging && <Skeleton aria-label="正在加载更多条目" className="mt-4 h-16 w-full" />}
    </>
  );
}

/** 用于承载一次过滤会话的列表与恢复状态，随会话 key 重挂载以重置 roving。 */
function ItemsSessionRegion(props: {
  filters: NewsItemFilters;
  hrefFor: (itemId: string) => string;
  onChangeFilters: (next: NewsItemFilters) => void;
  onOpenCreate: () => void;
  onOpenItem: (itemId: string) => void;
  online: boolean;
  subscriptions: SubscriptionsState;
}) {
  const stream = useNewsItems(props.filters, props.online);
  const noSubscriptions =
    props.subscriptions.status === 'ready' && props.subscriptions.items.length === 0;
  return (
    <>
      {stream.status === 'loading' && <ItemsSkeleton />}
      {stream.status === 'failed' && (
        <LoadFailure
          description={stream.message ?? '请稍后重试。'}
          onRetry={stream.retryFirst}
          title="无法加载条目流"
        />
      )}
      {stream.status === 'ready' && stream.items.length === 0 && (
        <ItemsEmpty
          filters={props.filters}
          hasSubscriptions={!noSubscriptions}
          onChangeFilters={props.onChangeFilters}
          onOpenCreate={props.onOpenCreate}
          online={props.online}
        />
      )}
      {stream.status === 'ready' && stream.items.length > 0 && (
        <ItemsReady
          hrefFor={props.hrefFor}
          items={stream.items}
          loadMore={stream.loadMore}
          nextCursor={stream.nextCursor}
          onOpenItem={props.onOpenItem}
          online={props.online}
          pageMessage={stream.pageMessage}
          paging={stream.paging}
        />
      )}
    </>
  );
}

/** 用于组合条目流 tab 的过滤行与恢复状态列表。 */
export function NewsItemsTab(props: {
  filters: NewsItemFilters;
  filtersKey: string;
  hrefFor: (itemId: string) => string;
  onChangeFilters: (next: NewsItemFilters) => void;
  onOpenCreate: () => void;
  onOpenItem: (itemId: string) => void;
  online: boolean;
  subscriptions: SubscriptionsState;
}) {
  return (
    <div className="grid gap-4">
      <NewsItemFiltersBar
        disabled={!props.online}
        filters={props.filters}
        onChange={props.onChangeFilters}
        subscriptions={props.subscriptions.status === 'ready' ? props.subscriptions.items : []}
      />
      <Separator />
      <ItemsSessionRegion
        filters={props.filters}
        hrefFor={props.hrefFor}
        key={props.filtersKey}
        onChangeFilters={props.onChangeFilters}
        onOpenCreate={props.onOpenCreate}
        onOpenItem={props.onOpenItem}
        online={props.online}
        subscriptions={props.subscriptions}
      />
    </div>
  );
}
