/**
 * @fileoverview 资讯页客户端根：URL 状态、订阅管理入口、Tabs 与条目详情 Sheet。
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { AlertCircleIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@everlearn/ui';

import { OfflineNotice } from '../../shared/offline-notice';
import { PageShell } from '../../shared/page-shell';
import { useOnline } from '../../shared/use-online';
import type { NewsItemFilters } from './news-api';
import { NewsDigestsTab } from './news-digests-tab';
import { NewsItemSheet } from './news-item-sheet';
import { NewsItemsTab } from './news-items-tab';
import type { SubscriptionDialogMode } from './news-subscription-dialog';
import { SubscriptionDialog } from './news-subscription-dialog';
import { NewsSubscriptionMenu } from './news-subscription-menu';
import { payloadFromSubscription } from './news-subscription-form';
import type { NewsSubscription, NewsSubscriptionPayload } from './news-subscriptions-api';
import { buildNewsHref, newsFiltersKey, parseNewsView } from './news-url';
import type { NewsView } from './news-url';
import { useNewsActions } from './use-news-actions';
import { useNewsSubscriptions } from './use-news-data';

/** 用于让浏览器后退/前进与本地视图保持一致。 */
function usePopStateSync(
  setView: Dispatch<SetStateAction<NewsView>>,
  pushedItem: RefObject<boolean>,
): void {
  useEffect(
    /** 用于绑定 popstate 并从地址栏恢复视图。 */
    function bindPopState(): () => void {
      /** 用于按地址栏深链恢复视图并校正 push 标记。 */
      function handlePopState(): void {
        const next = parseNewsView(window.location.search);
        pushedItem.current = next.item !== undefined;
        setView(next);
      }
      window.addEventListener('popstate', handlePopState);
      return /** 用于解除 popstate 监听。 */ function unbind(): void {
        window.removeEventListener('popstate', handlePopState);
      };
    },
    [pushedItem, setView],
  );
}

/** 用于同步本地视图与可分享 URL，并管理 ?item 深链历史。 */
function useNewsViewSync(initialSearchParams: string) {
  const router = useRouter();
  const [view, setView] = useState<NewsView>(() => parseNewsView(initialSearchParams));
  const pushedItem = useRef(false);
  usePopStateSync(setView, pushedItem);
  /** 用于以 replace 更新可分享状态。 */
  const replaceView = useCallback(
    (next: NewsView) => {
      setView(next);
      router.replace(buildNewsHref(next));
    },
    [router],
  );
  /** 用于打开条目详情并 push ?item 深链。 */
  const openItem = useCallback(
    (itemId: string) => {
      if (view.item === itemId) return;
      pushedItem.current = true;
      const next = { ...view, item: itemId };
      setView(next);
      router.push(buildNewsHref(next));
    },
    [router, view],
  );
  /** 用于关闭详情：push 打开的回退历史，深链直达则 replace。 */
  const closeItem = useCallback(() => {
    const next = { ...view, item: undefined };
    setView(next);
    if (!pushedItem.current) return void router.replace(buildNewsHref(next));
    pushedItem.current = false;
    router.back();
  }, [router, view]);
  /** 用于应用主题筛选并就地关闭详情。 */
  const applyTopic = useCallback(
    (subscriptionId: string) => {
      pushedItem.current = false;
      const next = { ...view, item: undefined, subscriptionId };
      setView(next);
      router.replace(buildNewsHref(next));
    },
    [router, view],
  );
  return { applyTopic, closeItem, openItem, replaceView, view };
}

/** 用于切换订阅启用状态且不影响历史运行。 */
async function toggleSubscription(
  actions: ReturnType<typeof useNewsActions>,
  subscription: NewsSubscription,
): Promise<void> {
  const payload = payloadFromSubscription(subscription);
  await actions.update(
    subscription.id,
    { ...payload, enabled: !subscription.enabled },
    subscription.version,
  );
}

/** 用于渲染主区 Tabs 与两个 tab 内容。 */
function NewsTabsRegion(props: {
  itemFilters: NewsItemFilters;
  onOpenCreate: () => void;
  onOpenItem: (itemId: string) => void;
  online: boolean;
  replaceView: (next: NewsView) => void;
  subscriptions: ReturnType<typeof useNewsSubscriptions>['state'];
  view: NewsView;
}) {
  const readySubscriptions =
    props.subscriptions.status === 'ready' ? props.subscriptions.items : [];
  const fallbackKnowledgeBaseId = readySubscriptions[0]?.newsKnowledgeBaseId ?? null;
  return (
    <Tabs
      onValueChange={(value) =>
        props.replaceView({ ...props.view, tab: value === 'digests' ? 'digests' : 'items' })
      }
      value={props.view.tab}
    >
      <TabsList aria-label="资讯视图">
        <TabsTrigger value="items">条目流</TabsTrigger>
        <TabsTrigger value="digests">简报</TabsTrigger>
      </TabsList>
      <TabsContent value="items">
        <NewsItemsTab
          filters={props.itemFilters}
          filtersKey={newsFiltersKey(props.view)}
          hrefFor={(itemId) => buildNewsHref({ ...props.view, item: itemId })}
          onChangeFilters={(filters) => props.replaceView({ tab: 'items', ...filters })}
          onOpenCreate={props.onOpenCreate}
          onOpenItem={props.onOpenItem}
          online={props.online}
          subscriptions={props.subscriptions}
        />
      </TabsContent>
      <TabsContent value="digests">
        <NewsDigestsTab
          active={props.view.tab === 'digests'}
          fallbackKnowledgeBaseId={fallbackKnowledgeBaseId}
          online={props.online}
        />
      </TabsContent>
    </Tabs>
  );
}

/** 用于渲染订阅动作的页内错误提示。 */
function ActionErrorAlert(props: { error: string; onDismiss: () => void }) {
  return (
    <Alert className="mt-4" variant="destructive">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>订阅操作失败</AlertTitle>
      <AlertDescription>
        <p className="m-0">{props.error}</p>
        <Button className="mt-2" onClick={props.onDismiss} size="sm" variant="outline">
          知道了
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** 用于渲染离线提示与订阅动作错误提示。 */
function NewsStatusNotices(props: {
  error: string | undefined;
  onDismiss: () => void;
  online: boolean;
}) {
  return (
    <>
      {!props.online && (
        <OfflineNotice description="当前离线：已加载条目与简报仍可查看，过滤与订阅操作暂不可用。" />
      )}
      {props.error !== undefined && (
        <ActionErrorAlert error={props.error} onDismiss={props.onDismiss} />
      )}
    </>
  );
}

/** 用于渲染页头订阅管理入口。 */
function NewsHeaderActions(props: {
  actions: ReturnType<typeof useNewsActions>;
  setDialogMode: (mode: SubscriptionDialogMode) => void;
  subscriptions: readonly NewsSubscription[];
}) {
  return (
    <NewsSubscriptionMenu
      onCreate={() => props.setDialogMode({ kind: 'create' })}
      onEdit={(subscription) => props.setDialogMode({ kind: 'edit', subscription })}
      onRun={(subscriptionId) => void props.actions.run(subscriptionId)}
      onToggle={(subscription) => void toggleSubscription(props.actions, subscription)}
      pending={props.actions.pending}
      subscriptions={props.subscriptions}
    />
  );
}

/** 用于按弹窗目标分发创建或更新提交。 */
function submitSubscription(
  actions: ReturnType<typeof useNewsActions>,
  payload: NewsSubscriptionPayload,
  target: { id?: string; version?: number },
): Promise<boolean> {
  if (target.id !== undefined && target.version !== undefined) {
    return actions.update(target.id, payload, target.version);
  }
  return actions.create(payload);
}

/** 用于渲染条目详情 Sheet 与订阅编辑弹窗浮层。 */
function NewsOverlays(props: {
  actions: ReturnType<typeof useNewsActions>;
  dialogMode: SubscriptionDialogMode | null;
  setDialogMode: (mode: SubscriptionDialogMode | null) => void;
  viewSync: ReturnType<typeof useNewsViewSync>;
}) {
  const { viewSync } = props;
  return (
    <>
      <NewsItemSheet
        itemId={viewSync.view.item}
        onClose={viewSync.closeItem}
        onViewTopic={viewSync.applyTopic}
      />
      <SubscriptionDialog
        mode={props.dialogMode}
        onClose={() => props.setDialogMode(null)}
        onSubmit={(payload, target) => submitSubscription(props.actions, payload, target)}
        pending={props.actions.pending}
        submitError={props.actions.error}
      />
    </>
  );
}

/** 用于派生稳定的条目过滤对象以避免多余请求。 */
function deriveItemFilters(view: NewsView): NewsItemFilters {
  return {
    ...(view.subscriptionId ? { subscriptionId: view.subscriptionId } : {}),
    ...(view.sourceType ? { sourceType: view.sourceType } : {}),
    ...(view.importance ? { importance: view.importance } : {}),
  };
}

/** 用于渲染资讯页全部子区。 */
function NewsPageView(props: {
  actions: ReturnType<typeof useNewsActions>;
  dialogMode: SubscriptionDialogMode | null;
  itemFilters: NewsItemFilters;
  online: boolean;
  replaceView: (next: NewsView) => void;
  setDialogMode: (mode: SubscriptionDialogMode | null) => void;
  subscriptions: ReturnType<typeof useNewsSubscriptions>['state'];
  viewSync: ReturnType<typeof useNewsViewSync>;
}) {
  const ready = props.subscriptions.status === 'ready' ? props.subscriptions.items : [];
  return (
    <PageShell
      actions={
        <NewsHeaderActions
          actions={props.actions}
          setDialogMode={props.setDialogMode}
          subscriptions={ready}
        />
      }
      lead="订阅来源，按重要性与时间浏览条目流，并回顾按日简报。"
      title={
        <h1 data-page-title tabIndex={-1}>
          资讯
        </h1>
      }
    >
      <NewsStatusNotices
        error={props.dialogMode === null ? props.actions.error : undefined}
        onDismiss={props.actions.clearError}
        online={props.online}
      />
      <NewsTabsRegion
        itemFilters={props.itemFilters}
        onOpenCreate={() => props.setDialogMode({ kind: 'create' })}
        onOpenItem={props.viewSync.openItem}
        online={props.online}
        replaceView={props.replaceView}
        subscriptions={props.subscriptions}
        view={props.viewSync.view}
      />
      <NewsOverlays
        actions={props.actions}
        dialogMode={props.dialogMode}
        setDialogMode={props.setDialogMode}
        viewSync={props.viewSync}
      />
    </PageShell>
  );
}

/** 用于渲染资讯页并组合全部子区。 */
export function NewsPage({ initialSearchParams }: { readonly initialSearchParams: string }) {
  const online = useOnline();
  const viewSync = useNewsViewSync(initialSearchParams);
  const subscriptions = useNewsSubscriptions();
  const actions = useNewsActions(subscriptions.reload);
  const [dialogMode, setDialogMode] = useState<SubscriptionDialogMode | null>(null);
  const itemFilters = useMemo(
    /** 用于稳定过滤对象身份，避免条目流多余请求。 */
    () => deriveItemFilters(viewSync.view),
    [viewSync.view],
  );
  return (
    <NewsPageView
      actions={actions}
      dialogMode={dialogMode}
      itemFilters={itemFilters}
      online={online}
      replaceView={viewSync.replaceView}
      setDialogMode={setDialogMode}
      subscriptions={subscriptions.state}
      viewSync={viewSync}
    />
  );
}
