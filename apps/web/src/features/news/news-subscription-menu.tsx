/**
 * @fileoverview 页头「订阅」下拉菜单：订阅状态、新建、编辑、立即运行与启停。
 */

'use client';

import { Fragment } from 'react';
import { ListRestartIcon, PencilIcon, PlayIcon, PlusIcon, RssIcon } from 'lucide-react';

import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useIsMobile,
} from '@everlearn/ui';

import type { NewsSubscription } from './news-subscriptions-api';
import { formatRelativeTime, scheduleLabel } from './news-format';
import { TopicDot } from './news-item-marks';

/** 用于渲染单条订阅的状态标签行。 */
function SubscriptionLabel({ subscription }: { subscription: NewsSubscription }) {
  return (
    <div className="flex w-full flex-col gap-0.5">
      <span className="flex items-center gap-2">
        <TopicDot slot={subscription.colorSlot} />
        <span className="truncate font-medium text-foreground">{subscription.name}</span>
        {!subscription.enabled && <Badge variant="secondary">已停用</Badge>}
      </span>
      <span className="text-xs text-muted-foreground">
        {scheduleLabel(subscription.schedule)}
        {subscription.nextRunAt ? ` · 下次 ${formatRelativeTime(subscription.nextRunAt)}` : ''}
      </span>
    </div>
  );
}

/** 用于渲染单条订阅的状态标签与编辑、运行、启停操作。 */
function SubscriptionMenuGroup(props: {
  actionsVisible: boolean;
  onEdit: (subscription: NewsSubscription) => void;
  onRun: (subscriptionId: string) => void;
  onToggle: (subscription: NewsSubscription) => void;
  pending: boolean;
  subscription: NewsSubscription;
}) {
  const { subscription } = props;
  return (
    <Fragment key={subscription.id}>
      <DropdownMenuLabel asChild>
        <div className="w-full">
          <SubscriptionLabel subscription={subscription} />
        </div>
      </DropdownMenuLabel>
      {props.actionsVisible && (
        <>
          <DropdownMenuItem
            /** 用于打开编辑弹窗。 */
            onSelect={() => props.onEdit(subscription)}
          >
            <PencilIcon aria-hidden="true" />
            编辑
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={props.pending || !subscription.enabled}
            /** 用于立即创建一次独立运行。 */
            onSelect={() => props.onRun(subscription.id)}
          >
            <PlayIcon aria-hidden="true" />
            立即运行
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={props.pending}
            /** 用于切换启用状态且不影响历史运行。 */
            onSelect={() => props.onToggle(subscription)}
          >
            <ListRestartIcon aria-hidden="true" />
            {subscription.enabled ? '停用' : '启用'}
          </DropdownMenuItem>
        </>
      )}
      <DropdownMenuSeparator />
    </Fragment>
  );
}

/** 用于渲染页头订阅管理入口与逐订阅操作；移动端仅展示订阅状态。 */
export function NewsSubscriptionMenu(props: {
  onCreate: () => void;
  onEdit: (subscription: NewsSubscription) => void;
  onRun: (subscriptionId: string) => void;
  onToggle: (subscription: NewsSubscription) => void;
  pending: boolean;
  subscriptions: readonly NewsSubscription[];
}) {
  const actionsVisible = !useIsMobile();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <RssIcon aria-hidden="true" />
          订阅
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {actionsVisible && (
          <DropdownMenuItem
            /** 用于打开新建订阅弹窗。 */
            onSelect={() => props.onCreate()}
          >
            <PlusIcon aria-hidden="true" />
            新建订阅
          </DropdownMenuItem>
        )}
        {actionsVisible && props.subscriptions.length > 0 && <DropdownMenuSeparator />}
        {props.subscriptions.map((subscription) => (
          <SubscriptionMenuGroup
            actionsVisible={actionsVisible}
            key={subscription.id}
            onEdit={props.onEdit}
            onRun={props.onRun}
            onToggle={props.onToggle}
            pending={props.pending}
            subscription={subscription}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
