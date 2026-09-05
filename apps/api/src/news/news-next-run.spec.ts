/**
 * @fileoverview 验证订阅计划下次运行时刻的时区安全计算，覆盖每日、每周与跨 DST 场景。
 */

import { describe, expect, it } from 'vitest';

import type { NewsScheduleView } from './news.dto';
import { computeNextRunAt } from './news.service.helpers';

/** 用于构造每日计划视图。 */
function daily(time: string, timezone: string): NewsScheduleView {
  return { kind: 'daily', time, timezone, weekday: null };
}

/** 用于构造每周计划视图。 */
function weekly(time: string, timezone: string, weekday: number): NewsScheduleView {
  return { kind: 'weekly', time, timezone, weekday };
}

describe('computeNextRunAt', () => {
  it('每日计划在当日未到点时返回当日，已过点时返回次日', () => {
    const schedule = daily('08:00', 'UTC');
    expect(computeNextRunAt(schedule, new Date('2026-09-05T07:00:00Z'))).toBe(
      '2026-09-05T08:00:00.000Z',
    );
    expect(computeNextRunAt(schedule, new Date('2026-09-05T08:00:00Z'))).toBe(
      '2026-09-06T08:00:00.000Z',
    );
  });

  it('每周计划返回下一个匹配星期', () => {
    // 2026-09-05 是周六，下一个周一是 2026-09-07。
    const schedule = weekly('09:00', 'UTC', 1);
    expect(computeNextRunAt(schedule, new Date('2026-09-05T10:00:00Z'))).toBe(
      '2026-09-07T09:00:00.000Z',
    );
  });

  it('UTC+8 每日计划按墙钟时间换算跨日边界', () => {
    const schedule = daily('08:00', 'Asia/Shanghai');
    // UTC 2026-09-05T20:00Z 是上海 9 月 6 日 04:00，当日 08:00 即 00:00Z。
    expect(computeNextRunAt(schedule, new Date('2026-09-05T20:00:00Z'))).toBe(
      '2026-09-06T00:00:00.000Z',
    );
    // 上海 9 月 5 日 08:30 已过当日 08:00，顺延到 9 月 6 日 08:00。
    expect(computeNextRunAt(schedule, new Date('2026-09-05T00:30:00Z'))).toBe(
      '2026-09-06T00:00:00.000Z',
    );
  });

  it('美国东部 11 月回拨后同一墙钟时刻偏移一小时', () => {
    // 2026-11-01 纽约从 EDT 切回 EST：11-01 08:00 墙钟 = 13:00Z（而非夏令时的 12:00Z）。
    const schedule = daily('08:00', 'America/New_York');
    expect(computeNextRunAt(schedule, new Date('2026-10-31T13:00:00Z'))).toBe(
      '2026-11-01T13:00:00.000Z',
    );
    // 夏令时仍生效的 10-31 08:00 墙钟 = 12:00Z。
    expect(computeNextRunAt(schedule, new Date('2026-10-31T09:00:00Z'))).toBe(
      '2026-10-31T12:00:00.000Z',
    );
  });

  it('非法时区或时间格式返回 null', () => {
    expect(computeNextRunAt(daily('08:00', 'Mars/Olympus'), new Date())).toBeNull();
    expect(computeNextRunAt(daily('25:00', 'UTC'), new Date())).toBeNull();
  });
});
