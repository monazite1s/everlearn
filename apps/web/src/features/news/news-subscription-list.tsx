/**
 * @fileoverview 渲染资讯订阅列表与立即运行操作。
 */

'use client';

import { PlayIcon } from 'lucide-react';

import { Button } from '@everlearn/ui';

import type { NewsSubscriptionItem } from './news-api';

/** 用于渲染订阅计划文案。 */
function scheduleLabel(schedule: NewsSubscriptionItem['schedule']): string {
  if (schedule === null) return '不自动运行';
  return `${schedule.kind === 'daily' ? '每日' : '每周一'} ${schedule.time} ${schedule.timezone}`;
}

/** 用于渲染订阅列表。 */
export function SubscriptionList({
  items,
  onRun,
  pending,
}: {
  items: NewsSubscriptionItem[];
  onRun: (subscriptionId: string) => void;
  pending: boolean;
}) {
  if (items.length === 0) {
    return <p className="mt-6 text-sm text-muted-foreground">还没有订阅，先用上方表单添加一个。</p>;
  }
  return (
    <ul className="mt-6 grid gap-3">
      {items.map((item) => (
        <li
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4"
          key={item.id}
        >
          <div className="grid gap-0.5">
            <span className="font-medium text-foreground">{item.name}</span>
            <span className="text-sm text-muted-foreground">
              {scheduleLabel(item.schedule)} · {item.latestRunStatus ?? '未运行'}
            </span>
          </div>
          <Button
            aria-label={`运行 ${item.name}`}
            disabled={pending}
            onClick={() => onRun(item.id)}
          >
            <PlayIcon className="size-4" />
            立即运行
          </Button>
        </li>
      ))}
    </ul>
  );
}
