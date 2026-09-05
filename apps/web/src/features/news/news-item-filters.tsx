/**
 * @fileoverview 渲染条目流的主题、来源类型与重要性过滤行。
 */

'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@everlearn/ui';

import type { NewsItemFilters } from './news-api';
import type { NewsSubscription } from './news-subscriptions-api';

const IMPORTANCE_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: '高', value: 'high' },
  { label: '普通', value: 'normal' },
  { label: '低', value: 'low' },
] as const;

const SOURCE_OPTIONS = [
  { label: '全部', value: 'all' },
  { label: 'RSS', value: 'rss' },
  { label: '搜索', value: 'search' },
] as const;

/** 用于渲染通用过滤下拉。 */
function FilterSelect(props: {
  disabled: boolean;
  label: string;
  onChange: (value: string) => void;
  options: readonly { label: string; value: string }[];
  value: string;
}) {
  return (
    <div className="grid min-w-0 gap-1.5 md:w-44">
      <span aria-hidden="true" className="text-xs text-muted-foreground">
        {props.label}
      </span>
      <Select disabled={props.disabled} onValueChange={props.onChange} value={props.value}>
        <SelectTrigger aria-label={props.label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {props.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** 用于渲染主题过滤，选项为全部订阅主题。 */
function TopicFilter(props: {
  disabled: boolean;
  filters: NewsItemFilters;
  onChange: (next: NewsItemFilters) => void;
  subscriptions: readonly NewsSubscription[];
}) {
  return (
    <FilterSelect
      disabled={props.disabled || props.subscriptions.length === 0}
      label="主题"
      onChange={(value) =>
        props.onChange({ ...props.filters, subscriptionId: value === 'all' ? undefined : value })
      }
      options={[
        { label: '全部主题', value: 'all' },
        ...props.subscriptions.map((subscription) => ({
          label: subscription.name,
          value: subscription.id,
        })),
      ]}
      value={props.filters.subscriptionId ?? 'all'}
    />
  );
}

/** 用于渲染来源类型与重要性过滤。 */
function PlainFilters(props: {
  disabled: boolean;
  filters: NewsItemFilters;
  onChange: (next: NewsItemFilters) => void;
}) {
  return (
    <>
      <FilterSelect
        disabled={props.disabled}
        label="来源类型"
        onChange={(value) =>
          props.onChange({
            ...props.filters,
            sourceType: value === 'all' ? undefined : (value as 'rss' | 'search'),
          })
        }
        options={SOURCE_OPTIONS}
        value={props.filters.sourceType ?? 'all'}
      />
      <FilterSelect
        disabled={props.disabled}
        label="重要性"
        onChange={(value) =>
          props.onChange({
            ...props.filters,
            importance: value === 'all' ? undefined : (value as 'high' | 'normal' | 'low'),
          })
        }
        options={IMPORTANCE_OPTIONS}
        value={props.filters.importance ?? 'all'}
      />
    </>
  );
}

/** 用于渲染主题、来源类型与重要性三联过滤，变化即从第一页重读。 */
export function NewsItemFiltersBar(props: {
  disabled: boolean;
  filters: NewsItemFilters;
  onChange: (next: NewsItemFilters) => void;
  subscriptions: readonly NewsSubscription[];
}) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-end">
      <TopicFilter
        disabled={props.disabled}
        filters={props.filters}
        onChange={props.onChange}
        subscriptions={props.subscriptions}
      />
      <PlainFilters disabled={props.disabled} filters={props.filters} onChange={props.onChange} />
    </div>
  );
}
