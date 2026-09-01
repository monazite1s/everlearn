/**
 * @fileoverview 渲染资讯订阅的新建表单字段。
 */

'use client';

import { Loader2Icon, PlusIcon } from 'lucide-react';
import type { FormEvent } from 'react';

import { Button, Input, Label } from '@everlearn/ui';

import { ScheduleFields } from './news-schedule-fields';
import type { NewsSchedule } from './news-api';

/** 表单受控字段的形状。 */
export interface NewsFormState {
  readonly exclude: string;
  readonly feedUrl: string;
  readonly include: string;
  readonly name: string;
  readonly scheduleKind: 'daily' | 'none' | 'weekly';
  readonly scheduleTime: string;
  readonly timezone: string;
}

export const INITIAL_NEWS_FORM: NewsFormState = {
  exclude: '',
  feedUrl: '',
  include: '',
  name: '',
  scheduleKind: 'daily',
  scheduleTime: '08:00',
  timezone: 'Asia/Shanghai',
};

/** 用于把逗号分隔的关键词输入解析为数组。 */
export function splitKeywords(value: string): string[] {
  return value
    .split(/[,，]/u)
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0);
}

/** 用于把表单组装为创建订阅载荷。 */
export function toCreatePayload(form: NewsFormState): {
  excludeKeywords: string[];
  feedUrl: string;
  includeKeywords: string[];
  name: string;
  schedule: NewsSchedule | null;
} {
  return {
    excludeKeywords: splitKeywords(form.exclude),
    feedUrl: form.feedUrl.trim(),
    includeKeywords: splitKeywords(form.include),
    name: form.name.trim(),
    schedule:
      form.scheduleKind === 'none'
        ? null
        : { kind: form.scheduleKind, time: form.scheduleTime, timezone: form.timezone },
  };
}

/** 用于渲染新建订阅表单。 */
export function SubscriptionForm({
  form,
  onChange,
  onSubmit,
  pending,
}: {
  form: NewsFormState;
  onChange: (form: NewsFormState) => void;
  onSubmit: (event: FormEvent) => void;
  pending: boolean;
}) {
  /** 用于合并一次受控字段更新。 */
  const update = (patch: Partial<NewsFormState>) => onChange({ ...form, ...patch });
  const canSubmit = !pending && form.name.trim().length > 0 && form.feedUrl.trim().length > 0;
  return (
    <form aria-label="创建订阅" className="mt-2 grid gap-3" onSubmit={onSubmit}>
      <TextFieldsGrid form={form} update={update} />
      <ScheduleFields form={form} update={update} />
      <Button className="w-fit" disabled={!canSubmit} type="submit">
        {pending ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <PlusIcon className="size-4" />
        )}
        创建订阅
      </Button>
    </form>
  );
}

/** 用于渲染表单上方的四个文本字段网格。 */
function TextFieldsGrid({
  form,
  update,
}: {
  form: NewsFormState;
  update: (patch: Partial<NewsFormState>) => void;
}) {
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
        id="news-feed-url"
        label="Feed 地址"
        onChange={(value) => update({ feedUrl: value })}
        placeholder="https://example.com/feed.xml"
        type="url"
        value={form.feedUrl}
      />
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

/** 用于渲染一个带标签的文本输入。 */
function TextField({
  id,
  label,
  onChange,
  placeholder,
  value,
  type = 'text',
  maxLength,
}: {
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
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </div>
  );
}
