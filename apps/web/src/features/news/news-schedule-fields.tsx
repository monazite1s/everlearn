/**
 * @fileoverview 渲染资讯订阅的计划、时间与时区字段。
 */

'use client';

import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@everlearn/ui';

import type { NewsFormState } from './news-subscription-form';

const TIMEZONES = ['Asia/Shanghai', 'UTC'] as const;

/** 用于渲染计划、时间与时区字段。 */
export function ScheduleFields({
  form,
  update,
}: {
  form: NewsFormState;
  update: (patch: Partial<NewsFormState>) => void;
}) {
  const off = form.scheduleKind === 'none';
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <KindField form={form} update={update} />
      <div className="grid gap-1.5">
        <Label htmlFor="news-time">运行时间</Label>
        <Input
          disabled={off}
          id="news-time"
          onChange={(event) => update({ scheduleTime: event.target.value })}
          type="time"
          value={form.scheduleTime}
        />
      </div>
      <TimezoneField form={form} update={update} />
    </div>
  );
}

/** 用于渲染计划类型选择。 */
function KindField({
  form,
  update,
}: {
  form: NewsFormState;
  update: (patch: Partial<NewsFormState>) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>计划</Label>
      <Select
        onValueChange={(value) => update({ scheduleKind: value as NewsFormState['scheduleKind'] })}
        value={form.scheduleKind}
      >
        <SelectTrigger>
          <SelectValue placeholder="选择计划" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="daily">每日</SelectItem>
          <SelectItem value="weekly">每周</SelectItem>
          <SelectItem value="none">不自动运行</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

/** 用于渲染时区选择。 */
function TimezoneField({
  form,
  update,
}: {
  form: NewsFormState;
  update: (patch: Partial<NewsFormState>) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>时区</Label>
      <Select
        disabled={form.scheduleKind === 'none'}
        onValueChange={(value) => update({ timezone: value })}
        value={form.timezone}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TIMEZONES.map((zone) => (
            <SelectItem key={zone} value={zone}>
              {zone}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
