/**
 * @fileoverview 实现限定所有者的资讯条目流过滤、keyset 分页与详情读取。
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import type { Sql, SqlBool } from 'kysely' with { 'resolution-mode': 'import' };
import type {
  NewsItemDetail,
  NewsItemListResponse,
  NewsItemSummary,
} from '@everlearn/contracts' with { 'resolution-mode': 'import' };

import { DatabaseService } from '../database/database.service';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { newsError } from './news.service.helpers';
import {
  decodeNewsItemsCursor,
  encodeNewsItemsCursor,
  newsItemsFilterFingerprint,
  type ListNewsItemsQueryDto,
  type NewsItemsCursorPayload,
} from './list-news-items-query.dto';

const MICROS_PER_SECOND = 1_000_000n;
// ponytail: 与 packages/contracts 的 NEWS_ITEMS_DEFAULT_LIMIT 同值；API 为 CJS 输出无法值导入 ESM 契约，升级条件为 API 转 ESM。
const DEFAULT_PAGE_LIMIT = 20;

/** 条目流查询行的数据库投影。 */
interface NewsItemListRow {
  readonly color_slot: number;
  readonly discovered_at: Date;
  readonly discovered_run_id: string | null;
  readonly id: string;
  readonly importance: string;
  readonly processed_content: string;
  readonly relevance: string;
  readonly snippet: string;
  readonly source_type: string;
  readonly subscription_id: string;
  readonly title: string;
  readonly topic: string;
  readonly url: string;
}

/** 用于跨 CommonJS API 边界加载 Kysely ESM SQL 标签。 */
async function loadSql(): Promise<Sql> {
  return (await import('kysely')).sql;
}

/** 用于把数据库行投影为公开条目摘要。 */
function toSummary(row: NewsItemListRow): NewsItemSummary {
  return {
    colorSlot: row.color_slot,
    discoveredAt: row.discovered_at.toISOString(),
    id: row.id,
    importance: row.importance as NewsItemSummary['importance'],
    snippet: row.snippet,
    sourceType: row.source_type as NewsItemSummary['sourceType'],
    subscriptionId: row.subscription_id,
    title: row.title,
    topic: row.topic,
    url: row.url,
  };
}

/** 用于执行条目流查询与详情读取的应用服务。 */
@Injectable()
export class NewsItemsService {
  /** 用于注入数据库客户端与身份边界。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identity: LocalIdentityContext,
  ) {}

  /** 用于按所有者与过滤条件返回固定排序的分页条目流。 */
  async list(query: ListNewsItemsQueryDto): Promise<NewsItemListResponse> {
    const ownerId = this.identity.getActor().ownerId;
    const cursor = this.resolveCursor(query);
    const sql = await loadSql();
    const discoveredAtMicros = sql<string>`(extract(epoch FROM news_items.discovered_at) * 1000000)::bigint::text`;
    const rows = (await this.baseSelect()
      .select(discoveredAtMicros.as('discovered_at_micros'))
      .where('news_items.owner_id', '=', ownerId)
      .where('news_items.relevance', '=', 'accepted')
      .$if(query.subscriptionId !== undefined, (qb) =>
        qb.where('news_items.subscription_id', '=', query.subscriptionId!),
      )
      .$if(query.sourceType !== undefined, (qb) =>
        qb.where('news_items.source_type', '=', query.sourceType!),
      )
      .$if(query.importance !== undefined, (qb) =>
        qb.where('news_items.importance', '=', query.importance!),
      )
      .$if(cursor !== undefined, (qb) => qb.where(this.buildKeysetPredicate(sql, cursor!)))
      .orderBy(
        sql`case news_items.importance when 'high' then 1 when 'normal' then 2 else 3 end`,
        'asc',
      )
      .orderBy('news_items.discovered_at', 'desc')
      .orderBy('news_items.id', 'desc')
      .limit((query.limit ?? DEFAULT_PAGE_LIMIT) + 1)
      .execute()) as unknown as (NewsItemListRow & { discovered_at_micros: string })[];
    const limit = query.limit ?? DEFAULT_PAGE_LIMIT;
    const pageRows = rows.slice(0, limit);
    const lastRow = pageRows.at(-1);
    return {
      items: pageRows.map(toSummary),
      nextCursor:
        rows.length <= limit || lastRow === undefined
          ? null
          : encodeNewsItemsCursor({
              discoveredAtMicros: lastRow.discovered_at_micros,
              f: newsItemsFilterFingerprint(query),
              id: lastRow.id,
              importance: lastRow.importance as 'high' | 'low' | 'normal',
              v: 2,
            }),
    };
  }

  /** 用于读取所有者名下单个条目的详情。 */
  async get(id: string): Promise<NewsItemDetail> {
    const ownerId = this.identity.getActor().ownerId;
    const row = (await this.baseSelect()
      .where('news_items.id', '=', id)
      .where('news_items.owner_id', '=', ownerId)
      .where('news_items.relevance', '=', 'accepted')
      .executeTakeFirst()) as unknown as NewsItemListRow | undefined;
    if (row === undefined) throw new NotFoundException();
    return {
      ...toSummary(row),
      discoveredRunId: row.discovered_run_id,
      processedContent: row.processed_content,
      relevance: row.relevance as 'accepted' | 'rejected',
    };
  }

  /** 用于构造联结订阅色槽的条目基础查询。 */
  private baseSelect() {
    return this.databaseService.client
      .selectFrom('news_items')
      .innerJoin('news_subscriptions', 'news_subscriptions.id', 'news_items.subscription_id')
      .select([
        'news_items.id',
        'news_items.subscription_id',
        'news_subscriptions.color_slot',
        'news_items.topic',
        'news_items.title',
        'news_items.snippet',
        'news_items.url',
        'news_items.source_type',
        'news_items.relevance',
        'news_items.importance',
        'news_items.discovered_at',
        'news_items.discovered_run_id',
        'news_items.processed_content',
      ]);
  }

  /** 用于解析已通过全局 DTO 边界的条目流游标并校验过滤指纹。 */
  private resolveCursor(query: ListNewsItemsQueryDto): NewsItemsCursorPayload | undefined {
    if (query.cursor === undefined) return;
    const payload = decodeNewsItemsCursor(query.cursor);
    if (payload === undefined) {
      throw newsError('VALIDATION_FAILED', '条目游标无效，请刷新后重试。', 400);
    }
    if (payload.f !== newsItemsFilterFingerprint(query)) {
      throw newsError('VALIDATION_FAILED', '游标与当前过滤条件不匹配，请重新筛选。', 400);
    }
    return payload;
  }

  /** 用于生成按重要性升序、发现时间与 id 倒序续页的混合方向谓词。 */
  private buildKeysetPredicate(sql: Sql, cursor: NewsItemsCursorPayload) {
    const [seconds, micros] = splitEpochMicros(cursor.discoveredAtMicros);
    const timestamp = sql`TIMESTAMPTZ 'epoch'
      + (${seconds}::bigint * interval '1 second')
      + (${micros}::bigint * interval '1 microsecond')`;
    const rank = sql`(case ${cursor.importance} when 'high' then 1 when 'normal' then 2 else 3 end)`;
    return sql<SqlBool>`(
      (case news_items.importance when 'high' then 1 when 'normal' then 2 else 3 end) > ${rank}
      OR (
        (case news_items.importance when 'high' then 1 when 'normal' then 2 else 3 end) = ${rank}
        AND (news_items.discovered_at, news_items.id) < (${timestamp}, ${cursor.id}::uuid)
      )
    )`;
  }
}

/** 用于拆分微秒时间戳，避免 PostgreSQL 接收有损浮点值。 */
function splitEpochMicros(micros: string): readonly [string, string] {
  const value = BigInt(micros);
  return [(value / MICROS_PER_SECOND).toString(), (value % MICROS_PER_SECOND).toString()];
}
