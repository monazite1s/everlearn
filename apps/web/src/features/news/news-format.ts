/**
 * @fileoverview 资讯页的相对时间与状态中文文案。
 */

import type { NewsSourceType, NewsStreamSourceType } from './news-api';
import type { NewsSchedule } from './news-subscriptions-api';

/** 用于把时间戳转换为中文相对时间。 */
export function formatRelativeTime(value: string, now = Date.now()): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  const seconds = Math.round((timestamp - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });
  if (Math.abs(seconds) < 60) return formatter.format(seconds, 'second');
  if (Math.abs(seconds) < 3600) return formatter.format(Math.round(seconds / 60), 'minute');
  if (Math.abs(seconds) < 86400) return formatter.format(Math.round(seconds / 3600), 'hour');
  return formatter.format(Math.round(seconds / 86400), 'day');
}

const SOURCE_LABELS: Record<NewsStreamSourceType, string> = { rss: 'RSS', search: '搜索' };

/** 用于把条目来源类型转换为中文标签。 */
export function streamSourceLabel(sourceType: NewsStreamSourceType): string {
  return SOURCE_LABELS[sourceType];
}

const FORM_SOURCE_LABELS: Record<NewsSourceType, string> = {
  rss: 'RSS/Atom',
  search: '搜索',
  site: '站点',
};

/** 用于把表单来源类型转换为中文标签。 */
export function formSourceLabel(sourceType: NewsSourceType): string {
  return FORM_SOURCE_LABELS[sourceType];
}

/** 用于把简报状态码转换为中文标签。 */
export function digestStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    failed: '失败',
    running: '生成中',
    succeeded: '已完成',
    succeeded_warning: '已完成（有警告）',
  };
  return labels[status] ?? status;
}

/** 用于把订阅计划转换为下一次运行说明。 */
export function scheduleLabel(schedule: NewsSchedule | null): string {
  if (schedule === null) return '不自动运行';
  const weekday = schedule.kind === 'weekly' && schedule.weekday ? `周${schedule.weekday} ` : '';
  return `${schedule.kind === 'daily' ? '每日' : '每周'} ${weekday}${schedule.time} ${schedule.timezone}`;
}
