/**
 * @fileoverview 渲染订阅表单的频率、星期、执行时刻与时区字段。
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
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'] as const;

/** 用于渲染计划类型选择。 */
function KindField(props: {
  form: NewsFormState;
  update: (patch: Partial<NewsFormState>) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>频率</Label>
      <Select
        onValueChange={(value) =>
          props.update({ scheduleKind: value as NewsFormState['scheduleKind'] })
        }
        value={props.form.scheduleKind}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="选择频率" />
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

/** 用于渲染每周计划专属的星期选择。 */
function WeekdayField(props: {
  form: NewsFormState;
  update: (patch: Partial<NewsFormState>) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>星期</Label>
      <Select
        disabled={props.form.scheduleKind !== 'weekly'}
        onValueChange={(value) => props.update({ weekday: Number(value) })}
        value={String(props.form.weekday)}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {WEEKDAYS.map((label, index) => (
            <SelectItem key={label} value={String(index + 1)}>
              周{label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** 用于渲染时区选择。 */
function TimezoneField(props: {
  form: NewsFormState;
  update: (patch: Partial<NewsFormState>) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <Label>时区</Label>
      <Select
        disabled={props.form.scheduleKind === 'none'}
        onValueChange={(value) => props.update({ timezone: value })}
        value={props.form.timezone}
      >
        <SelectTrigger className="w-full">
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

/** 用于渲染订阅计划相关的四个字段。 */
export function ScheduleFields(props: {
  form: NewsFormState;
  update: (patch: Partial<NewsFormState>) => void;
}) {
  const off = props.form.scheduleKind === 'none';
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <KindField form={props.form} update={props.update} />
      <WeekdayField form={props.form} update={props.update} />
      <div className="grid gap-1.5">
        <Label htmlFor="news-time">执行时刻</Label>
        <Input
          disabled={off}
          id="news-time"
          onChange={(event) => props.update({ scheduleTime: event.target.value })}
          type="time"
          value={props.form.scheduleTime}
        />
      </div>
      <TimezoneField form={props.form} update={props.update} />
    </div>
  );
}
