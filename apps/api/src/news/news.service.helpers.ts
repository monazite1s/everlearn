/**
 * @fileoverview 提供资讯模块共享的错误构造、运行行投影与简报列表查询函数。
 */

import { ApiDomainException } from '../http-boundary/api-domain.exception';
import type { DatabaseSchema, Json } from '../database/database.types';
import type {
  NewsDigestListItem,
  NewsDigestListResponse,
  NewsDigestRunSummary,
  NewsScheduleView,
} from './news.dto';
import { withNewsTables } from './news-db.types';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

const DIGEST_PAGE_SIZE = 20;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** 时区墙钟日期分量的中间形态。 */
interface ZonedDate {
  readonly day: number;
  readonly month: number;
  readonly year: number;
}

// 时区格式化器缓存，避免高频投影重复构造 Intl 对象。
const formatterCache = new Map<string, Intl.DateTimeFormat>();

/** 用于构造指定时区的固定格式化器并按进程生命周期缓存。 */
function zonedFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached !== undefined) return cached;
  const formatter = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** 用于把某时刻在某时区的墙钟分量解析为数字记录。 */
function readZonedParts(
  timeZone: string,
  instant: Date,
): ZonedDate & { hour: number; minute: number } {
  const record: Record<string, number> = {};
  for (const part of zonedFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') record[part.type] = Number(part.value);
  }
  return {
    day: record.day!,
    hour: record.hour!,
    minute: record.minute!,
    month: record.month!,
    year: record.year!,
  };
}

/** 用于返回某时区在给定时刻的 UTC 偏移毫秒数。 */
function timezoneOffsetMs(timeZone: string, instant: Date): number {
  const parts = readZonedParts(timeZone, instant);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return asUtc - instant.getTime();
}

/** 用于判断某时刻在某时区的墙钟时间与目标分量完全一致。 */
function wallTimeMatches(
  timeZone: string,
  instant: Date,
  target: ZonedDate & { hour: number; minute: number },
): boolean {
  const parts = readZonedParts(timeZone, instant);
  return (
    parts.year === target.year &&
    parts.month === target.month &&
    parts.day === target.day &&
    parts.hour === target.hour &&
    parts.minute === target.minute
  );
}

/** 用于把时区墙钟时间换算为 UTC 时刻，不存在时返回 null、歧义时取最早一次。 */
function wallTimeToUtc(
  target: ZonedDate & { hour: number; minute: number },
  timeZone: string,
): Date | null {
  const guessUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  const offsets = new Set(
    [guessUtc, guessUtc - 6 * HOUR_MS, guessUtc + 6 * HOUR_MS].map((probe) =>
      timezoneOffsetMs(timeZone, new Date(probe)),
    ),
  );
  let earliest: number | null = null;
  for (const offset of offsets) {
    const timestamp = guessUtc - offset;
    if (wallTimeMatches(timeZone, new Date(timestamp), target)) {
      if (earliest === null || timestamp < earliest) earliest = timestamp;
    }
  }
  return earliest === null ? null : new Date(earliest);
}

/** 用于计算计划在 from 之后的下次运行时刻，计划形态不合法或时区无效时返回 null。 */
export function computeNextRunAt(schedule: NewsScheduleView, from: Date): string | null {
  const matched = /^([01]\d|2[0-3]):([0-5]\d)$/u.exec(schedule.time);
  if (matched === null) return null;
  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  try {
    const today = readZonedParts(schedule.timezone, from);
    const firstDay = Date.UTC(today.year, today.month - 1, today.day);
    // ponytail: daily 只看今天与明天、weekly 看满 8 天；跨 DST 的墙钟换算由 wallTimeToUtc 兜底。
    const maxDayOffset = schedule.kind === 'weekly' ? 7 : 1;
    for (let offset = 0; offset <= maxDayOffset; offset += 1) {
      const anchor = new Date(firstDay + offset * DAY_MS);
      const target = {
        day: anchor.getUTCDate(),
        hour,
        minute,
        month: anchor.getUTCMonth() + 1,
        year: anchor.getUTCFullYear(),
      };
      if (schedule.kind === 'weekly' && anchor.getUTCDay() !== schedule.weekday) continue;
      const candidate = wallTimeToUtc(target, schedule.timezone);
      if (candidate !== null && candidate.getTime() > from.getTime())
        return candidate.toISOString();
    }
    return null;
  } catch {
    return null;
  }
}

/** 用于构造携带稳定错误码的领域拒绝。 */
export function newsError(code: string, message: string, status: number): ApiDomainException {
  return new ApiDomainException({ code, kind: 'domain', message, status });
}

/** 用于把运行行投影为带来源决策与警告的公开摘要。 */
export function toDigestRunSummary(row: {
  brief_document_id: string | null;
  created_at: Date;
  error_code: string | null;
  id: string;
  source_results: Json;
  status: string;
  subscription_id: string;
  warnings: Json;
}): NewsDigestRunSummary {
  return {
    briefDocumentId: row.brief_document_id,
    createdAt: row.created_at.toISOString(),
    errorCode: row.error_code,
    id: row.id,
    sourceResults: Array.isArray(row.source_results)
      ? (row.source_results as unknown as NewsDigestRunSummary['sourceResults'])
      : [],
    status: row.status,
    subscriptionId: row.subscription_id,
    warnings: Array.isArray(row.warnings) ? (row.warnings as string[]) : [],
  };
}

/** 用于按日倒序分页读取简报运行并聚合采纳条目数。 */
export async function listDigestPage(
  database: Kysely<DatabaseSchema>,
  ownerId: string,
  cursor: string | undefined,
): Promise<NewsDigestListResponse> {
  const until = cursor === undefined ? undefined : new Date(decodeCursorDate(cursor));
  const rows = await withNewsTables(database)
    .selectFrom('news_digest_runs')
    .innerJoin('news_subscriptions', 'news_subscriptions.id', 'news_digest_runs.subscription_id')
    .select([
      'news_digest_runs.id',
      'news_digest_runs.created_at',
      'news_digest_runs.status',
      'news_digest_runs.brief_document_id',
      'news_digest_runs.warnings',
      'news_subscriptions.news_knowledge_base_id',
      'news_subscriptions.name',
    ])
    .where('news_digest_runs.owner_id', '=', ownerId)
    .$if(until !== undefined, (query) => query.where('news_digest_runs.created_at', '<', until!))
    .orderBy('news_digest_runs.created_at', 'desc')
    .limit(DIGEST_PAGE_SIZE + 1)
    .execute();
  const page = rows.slice(0, DIGEST_PAGE_SIZE);
  const counts = await readDigestItemCounts(
    database,
    page.map((row) => row.id),
  );
  const items = page.map((row) => toDigestListItem(row, counts.get(row.id) ?? 0));
  const last = page.at(-1);
  return {
    items,
    nextCursor:
      rows.length <= DIGEST_PAGE_SIZE || last === undefined ? null : last.created_at.toISOString(),
  };
}

/** 用于统计每份简报运行发现的采纳条目数。 */
async function readDigestItemCounts(
  database: Kysely<DatabaseSchema>,
  runIds: readonly string[],
): Promise<Map<string, number>> {
  if (runIds.length === 0) return new Map();
  const rows = await withNewsTables(database)
    .selectFrom('news_items')
    .select(({ fn }) => ['discovered_run_id', fn.countAll().as('count')])
    .where('discovered_run_id', 'in', [...runIds])
    .where('relevance', '=', 'accepted')
    .groupBy('discovered_run_id')
    .execute();
  return new Map(rows.map((row) => [row.discovered_run_id!, Number(row.count)]));
}

/** 用于把运行行投影为简报按日列表项。 */
function toDigestListItem(
  row: {
    brief_document_id: string | null;
    created_at: Date;
    id: string;
    name: string;
    news_knowledge_base_id: string;
    status: string;
    warnings: unknown;
  },
  itemCount: number,
): NewsDigestListItem {
  return {
    digestDate: row.created_at.toISOString().slice(0, 10),
    documentId: row.brief_document_id,
    id: row.id,
    itemCount,
    knowledgeBaseId: row.news_knowledge_base_id,
    status: row.status,
    title: `${row.name} · ${row.created_at.toISOString().slice(0, 10)}`,
    warningCount: Array.isArray(row.warnings) ? row.warnings.length : 0,
  };
}

/** 用于校验游标日期字符串可解析。 */
function decodeCursorDate(cursor: string): string {
  const date = new Date(cursor);
  if (Number.isNaN(date.getTime())) {
    throw newsError('VALIDATION_FAILED', '简报游标无效，请刷新后重试。', 400);
  }
  return cursor;
}
