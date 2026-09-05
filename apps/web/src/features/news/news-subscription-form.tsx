/**
 * @fileoverview 资讯订阅编辑表单的状态组装与字段渲染。
 */

'use client';

import type { FormEvent } from 'react';

import { Button, Input, Label, Textarea } from '@everlearn/ui';

import type { NewsSourceType } from './news-api';
import type {
  NewsSchedule,
  NewsSubscription,
  NewsSubscriptionPayload,
} from './news-subscriptions-api';
import { formSourceLabel } from './news-format';
import { ScheduleFields } from './news-schedule-fields';

/** 表单受控字段的形状。 */
export interface NewsFormState {
  readonly enabled: boolean;
  readonly exclude: string;
  readonly include: string;
  readonly name: string;
  readonly scheduleKind: 'daily' | 'none' | 'weekly';
  readonly scheduleTime: string;
  readonly sourceType: NewsSourceType;
  readonly sources: string;
  readonly timezone: string;
  readonly topic: string;
  readonly weekday: number;
}

export const INITIAL_NEWS_FORM: NewsFormState = {
  enabled: true,
  exclude: '',
  include: '',
  name: '',
  scheduleKind: 'daily',
  scheduleTime: '08:00',
  sourceType: 'rss',
  sources: '',
  timezone: 'Asia/Shanghai',
  topic: '',
  weekday: 1,
};

/** 用于把逗号分隔的关键词输入解析为数组。 */
export function splitKeywords(value: string): string[] {
  return value
    .split(/[,，]/u)
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);
}

/** 用于把多行来源输入解析为非空行数组。 */
export function splitSourceLines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** 用于把表单组装为创建或更新订阅载荷。 */
export function toSubscriptionPayload(form: NewsFormState): NewsSubscriptionPayload {
  return {
    enabled: form.enabled,
    excludeKeywords: splitKeywords(form.exclude),
    includeKeywords: splitKeywords(form.include),
    name: form.name.trim(),
    schedule:
      form.scheduleKind === 'none'
        ? null
        : {
            kind: form.scheduleKind,
            time: form.scheduleTime,
            timezone: form.timezone,
            weekday: form.scheduleKind === 'weekly' ? form.weekday : null,
          },
    sources: splitSourceLines(form.sources).map((value) => ({ type: form.sourceType, value })),
    topic: form.topic.trim(),
  };
}

/** 用于从订阅投影回填编辑表单。 */
export function formFromSubscription(subscription: NewsSubscription): NewsFormState {
  const schedule: NewsSchedule | null = subscription.schedule;
  return {
    enabled: subscription.enabled,
    exclude: subscription.excludeKeywords.join('，'),
    include: subscription.includeKeywords.join('，'),
    name: subscription.name,
    scheduleKind: schedule === null ? 'none' : schedule.kind,
    scheduleTime: schedule === null ? '08:00' : schedule.time,
    sourceType: subscription.sources[0]?.type ?? 'rss',
    sources: subscription.sources.map((source) => source.value).join('\n'),
    timezone: schedule === null ? 'Asia/Shanghai' : schedule.timezone,
    topic: subscription.topic,
    weekday: schedule?.weekday ?? 1,
  };
}

/** 用于从订阅投影重建更新载荷，供启停等局部动作复用。 */
export function payloadFromSubscription(subscription: NewsSubscription): NewsSubscriptionPayload {
  return {
    enabled: subscription.enabled,
    excludeKeywords: [...subscription.excludeKeywords],
    includeKeywords: [...subscription.includeKeywords],
    name: subscription.name,
    schedule: subscription.schedule,
    sources: [...subscription.sources],
    topic: subscription.topic,
  };
}

/** 用于渲染一个带标签的文本输入。 */
function TextField(props: {
  id: string;
  label: string;
  maxLength?: number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  value: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        maxLength={props.maxLength}
        onChange={(event) => props.onChange(event.target.value)}
        placeholder={props.placeholder}
        type={props.type}
        value={props.value}
      />
    </div>
  );
}

/** 用于渲染订阅表单上半部的名称、主题、来源与关键词字段。 */
function SubscriptionFields(props: {
  form: NewsFormState;
  update: (patch: Partial<NewsFormState>) => void;
}) {
  const { form, update } = props;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <TextField
        id="news-name"
        label="订阅名称"
        maxLength={120}
        onChange={(value) => update({ name: value })}
        placeholder="例如：AI 前沿"
        value={form.name}
      />
      <TextField
        id="news-topic"
        label="主题（自然语言，用于相关性与重要性判定）"
        maxLength={200}
        onChange={(value) => update({ topic: value })}
        placeholder="例如：大模型与 Agent 工程的产业进展"
        value={form.topic}
      />
      <div className="grid gap-1.5 md:col-span-2">
        <Label htmlFor="news-sources">来源（{formSourceLabel(form.sourceType)}，每行一条）</Label>
        <Textarea
          id="news-sources"
          onChange={(event) => update({ sources: event.target.value })}
          placeholder={'https://example.com/feed.xml\nhttps://another.com/rss'}
          rows={3}
          value={form.sources}
        />
      </div>
      <TextField
        id="news-include"
        label="包含关键词（逗号分隔，可空）"
        onChange={(value) => update({ include: value })}
        value={form.include}
      />
      <TextField
        id="news-exclude"
        label="排除关键词（逗号分隔，可空）"
        onChange={(value) => update({ exclude: value })}
        value={form.exclude}
      />
    </div>
  );
}

/** 用于渲染订阅表单并在提交时回传组装载荷。 */
export function SubscriptionForm(props: {
  form: NewsFormState;
  onChange: (form: NewsFormState) => void;
  onSubmit: (event: FormEvent) => void;
  pending: boolean;
}) {
  const update = /** 用于合并一次受控字段更新。 */ (patch: Partial<NewsFormState>) =>
    props.onChange({ ...props.form, ...patch });
  const canSubmit =
    !props.pending &&
    props.form.name.trim().length > 0 &&
    props.form.topic.trim().length > 0 &&
    splitSourceLines(props.form.sources).length > 0;
  return (
    <form aria-label="订阅编辑" className="grid gap-4" onSubmit={props.onSubmit}>
      <SubscriptionFields form={props.form} update={update} />
      <ScheduleFields form={props.form} update={update} />
      <Button className="w-fit" disabled={!canSubmit} type="submit">
        {props.pending ? '正在保存…' : '保存订阅'}
      </Button>
    </form>
  );
}
