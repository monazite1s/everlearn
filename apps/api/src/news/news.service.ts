/**
 * @fileoverview 实现限定所有者的资讯订阅 CRUD、多来源配置与简报运行读取。
 */

import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import type { JsonValue } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { CreateNewsSubscriptionDto } from './create-news-subscription.dto';
import { withNewsTables, type NewsDatabaseSchema } from './news-db.types';
import type {
  NewsDigestListResponse,
  NewsDigestRunSummary,
  NewsScheduleView,
  NewsSourceView,
  NewsSubscriptionSummary,
} from './news.dto';
import {
  computeNextRunAt,
  listDigestPage,
  newsError,
  toDigestRunSummary,
} from './news.service.helpers';
import { UpdateNewsSubscriptionDto } from './update-news-subscription.dto';

const NEWS_KB_NAME = '资讯';

/** 订阅行的数据库读取投影。 */
interface SubscriptionRow {
  color_slot: number;
  created_at: Date;
  enabled: boolean;
  exclude_keywords: string[];
  id: string;
  include_keywords: string[];
  name: string;
  news_knowledge_base_id: string;
  schedule: unknown;
  topic: string;
  version: number;
}

/** 用于读取计划 jsonb 为带星期的公开投影。 */
function toScheduleView(value: unknown): NewsScheduleView | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as { kind?: unknown; time?: unknown; timezone?: unknown; weekday?: unknown };
  if (record.kind !== 'daily' && record.kind !== 'weekly') return null;
  if (typeof record.time !== 'string' || typeof record.timezone !== 'string') return null;
  return {
    kind: record.kind,
    time: record.time,
    timezone: record.timezone,
    weekday: typeof record.weekday === 'number' ? record.weekday : null,
  };
}

/** 用于把订阅行与来源列表组装为公开摘要。 */
function toSummary(
  row: SubscriptionRow,
  sources: readonly NewsSourceView[],
  now: Date,
): NewsSubscriptionSummary {
  const schedule = toScheduleView(row.schedule);
  return {
    colorSlot: row.color_slot,
    enabled: row.enabled,
    excludeKeywords: row.exclude_keywords,
    id: row.id,
    includeKeywords: row.include_keywords,
    name: row.name,
    newsKnowledgeBaseId: row.news_knowledge_base_id,
    nextRunAt: schedule === null || !row.enabled ? null : computeNextRunAt(schedule, now),
    schedule,
    sources,
    topic: row.topic,
    version: row.version,
  };
}

/** 用于持有资讯订阅切片的数据库与身份依赖。 */
@Injectable()
export class NewsService {
  /** 用于注入数据库与身份边界。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identity: LocalIdentityContext,
  ) {}

  /** 用于确保所有者存在唯一的资讯知识库并返回其 id。 */
  private async ensureNewsKnowledgeBase(
    database: Kysely<NewsDatabaseSchema>,
    ownerId: string,
  ): Promise<string> {
    const existing = await database
      .selectFrom('knowledge_bases')
      .select('id')
      .where('owner_id', '=', ownerId)
      .where('name', '=', NEWS_KB_NAME)
      .where('deleted_at', 'is', null)
      .orderBy('created_at', 'asc')
      .limit(1)
      .executeTakeFirst();
    if (existing !== undefined) return existing.id;
    const id = randomUUID();
    await database
      .insertInto('knowledge_bases')
      .values({
        id,
        owner_id: ownerId,
        name: NEWS_KB_NAME,
        kind: 'news',
      })
      .executeTakeFirstOrThrow();
    return id;
  }

  /** 用于在同一事务内创建订阅、写入多来源并自动确保资讯知识库存在。 */
  async create(input: CreateNewsSubscriptionDto): Promise<NewsSubscriptionSummary> {
    const ownerId = this.identity.getActor().ownerId;
    return this.databaseService.client.transaction().execute(async (transaction) => {
      const database = withNewsTables(transaction);
      const knowledgeBaseId = await this.ensureNewsKnowledgeBase(database, ownerId);
      const colorSlot = await this.pickColorSlot(database, ownerId);
      const row = await database
        .insertInto('news_subscriptions')
        .values({
          id: randomUUID(),
          owner_id: ownerId,
          name: input.name,
          topic: input.topic,
          color_slot: colorSlot,
          include_keywords: input.includeKeywords ?? [],
          exclude_keywords: input.excludeKeywords ?? [],
          schedule: (input.schedule ?? null) as JsonValue,
          news_knowledge_base_id: knowledgeBaseId,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const sources = await this.replaceSources(database, row.id, input.sources);
      return toSummary(row, sources, new Date());
    });
  }

  /** 用于在同一事务内按所有者约束整体替换订阅字段、来源与计划（乐观并发）。 */
  async update(id: string, input: UpdateNewsSubscriptionDto): Promise<NewsSubscriptionSummary> {
    const ownerId = this.identity.getActor().ownerId;
    return this.databaseService.client.transaction().execute(async (transaction) => {
      const database = withNewsTables(transaction);
      const row = await database
        .updateTable('news_subscriptions')
        .set({
          name: input.name,
          topic: input.topic,
          include_keywords: input.includeKeywords ?? [],
          exclude_keywords: input.excludeKeywords ?? [],
          schedule: (input.schedule ?? null) as JsonValue,
          ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
          /** 用于在并发更新通过版本守卫后递增乐观版本号。 */
          version: (expression) => expression('version', '+', 1),
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .where('owner_id', '=', ownerId)
        .where('version', '=', input.version)
        .returningAll()
        .executeTakeFirst();
      if (row === undefined) {
        const existing = await this.readSubscription(database, ownerId, id);
        throw newsError(
          'VERSION_CONFLICT',
          '订阅已被其他保存更新，请刷新后重试。',
          existing === undefined ? 404 : 409,
        );
      }
      const sources = await this.replaceSources(database, id, input.sources);
      return toSummary(row, sources, new Date());
    });
  }

  /** 用于列出所有者的订阅及其来源配置。 */
  async list(): Promise<NewsSubscriptionSummary[]> {
    const ownerId = this.identity.getActor().ownerId;
    const rows = await withNewsTables(this.databaseService.client)
      .selectFrom('news_subscriptions')
      .selectAll()
      .where('owner_id', '=', ownerId)
      .orderBy('created_at', 'desc')
      .execute();
    if (rows.length === 0) return [];
    const sources = await this.readSources(rows.map((row) => row.id));
    return rows.map((row) => toSummary(row, sources.get(row.id) ?? [], new Date()));
  }

  /** 用于按订阅集合批量读取来源配置。 */
  private async readSources(
    subscriptionIds: readonly string[],
  ): Promise<Map<string, NewsSourceView[]>> {
    const rows = await withNewsTables(this.databaseService.client)
      .selectFrom('news_sources')
      .select(['subscription_id', 'type', 'value'])
      .where(
        'subscription_id',
        'in',
        subscriptionIds.filter((value, index, all) => all.indexOf(value) === index),
      )
      .orderBy('created_at', 'asc')
      .execute();
    const grouped = new Map<string, NewsSourceView[]>();
    for (const row of rows) {
      const list = grouped.get(row.subscription_id) ?? [];
      list.push({ type: row.type as NewsSourceView['type'], value: row.value });
      grouped.set(row.subscription_id, list);
    }
    return grouped;
  }

  /** 用于全量替换订阅来源并返回替换后的列表。 */
  private async replaceSources(
    database: Kysely<NewsDatabaseSchema>,
    subscriptionId: string,
    sources: readonly NewsSourceView[],
  ): Promise<NewsSourceView[]> {
    await database
      .deleteFrom('news_sources')
      .where('subscription_id', '=', subscriptionId)
      .execute();
    if (sources.length > 0) {
      await database
        .insertInto('news_sources')
        .values(
          sources.map((source) => ({
            id: randomUUID(),
            subscription_id: subscriptionId,
            type: source.type,
            value: source.value,
          })),
        )
        .execute();
    }
    return [...sources];
  }

  /** 用于挑选 1..5 内当前占用最少的主题色槽。 */
  private async pickColorSlot(
    database: Kysely<NewsDatabaseSchema>,
    ownerId: string,
  ): Promise<number> {
    const rows = await database
      .selectFrom('news_subscriptions')
      .select('color_slot')
      .where('owner_id', '=', ownerId)
      .execute();
    const counts = new Map<number, number>([1, 2, 3, 4, 5].map((slot) => [slot, 0]));
    for (const row of rows) counts.set(row.color_slot, (counts.get(row.color_slot) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[1] - b[1] || a[0] - b[0])[0]![0];
  }

  /** 用于按所有者读取订阅行，缺失时返回 undefined。 */
  private async readSubscription(
    database: Kysely<NewsDatabaseSchema>,
    ownerId: string,
    id: string,
  ): Promise<SubscriptionRow | undefined> {
    return database
      .selectFrom('news_subscriptions')
      .selectAll()
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .executeTakeFirst();
  }

  /** 用于删除所有者订阅，已见条目与运行随级联删除。 */
  async remove(id: string): Promise<void> {
    const result = await withNewsTables(this.databaseService.client)
      .deleteFrom('news_subscriptions')
      .where('id', '=', id)
      .where('owner_id', '=', this.identity.getActor().ownerId)
      .executeTakeFirstOrThrow();
    if (Number(result.numDeletedRows) === 0) throw new NotFoundException();
  }

  /** 用于为订阅创建一次待执行简报运行。 */
  async createRun(subscriptionId: string): Promise<NewsDigestRunSummary> {
    const ownerId = this.identity.getActor().ownerId;
    const subscription = await withNewsTables(this.databaseService.client)
      .selectFrom('news_subscriptions')
      .select('id')
      .where('id', '=', subscriptionId)
      .where('owner_id', '=', ownerId)
      .executeTakeFirst();
    if (subscription === undefined) throw new NotFoundException();
    return this.insertPendingRun(subscriptionId, ownerId);
  }

  /** 用于写入一条待执行简报运行并投影摘要。 */
  private async insertPendingRun(
    subscriptionId: string,
    ownerId: string,
  ): Promise<NewsDigestRunSummary> {
    const row = await withNewsTables(this.databaseService.client)
      .insertInto('news_digest_runs')
      .values({
        id: randomUUID(),
        subscription_id: subscriptionId,
        owner_id: ownerId,
        status: 'pending',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDigestRunSummary(row);
  }

  /** 用于按订阅或全局列出最近简报运行。 */
  async listRuns(subscriptionId?: string): Promise<NewsDigestRunSummary[]> {
    const ownerId = this.identity.getActor().ownerId;
    const rows = await withNewsTables(this.databaseService.client)
      .selectFrom('news_digest_runs')
      .selectAll()
      .where('owner_id', '=', ownerId)
      .$if(subscriptionId !== undefined, (query) =>
        query.where('subscription_id', '=', subscriptionId!),
      )
      .orderBy('created_at', 'desc')
      .limit(20)
      .execute();
    return rows.map(toDigestRunSummary);
  }

  /** 用于读取所有者名下单个简报运行的详情。 */
  async getRun(runId: string): Promise<NewsDigestRunSummary> {
    const ownerId = this.identity.getActor().ownerId;
    const row = await withNewsTables(this.databaseService.client)
      .selectFrom('news_digest_runs')
      .selectAll()
      .where('id', '=', runId)
      .where('owner_id', '=', ownerId)
      .executeTakeFirst();
    if (row === undefined) throw new NotFoundException();
    return toDigestRunSummary(row);
  }

  /** 用于按日倒序列出所有者的简报运行并附条目计数。 */
  async listDigests(cursor?: string): Promise<NewsDigestListResponse> {
    return listDigestPage(this.databaseService.client, this.identity.getActor().ownerId, cursor);
  }
}
