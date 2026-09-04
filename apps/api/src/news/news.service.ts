/**
 * @fileoverview 实现限定所有者的资讯订阅 CRUD 与简报运行创建。
 */

import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';

import type { JsonValue } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import { ApiDomainException } from '../http-boundary/api-domain.exception';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { CreateNewsSubscriptionDto } from './create-news-subscription.dto';
import { withNewsTables } from './news-db.types';
import type { NewsDigestRunSummary, NewsSubscriptionSummary } from './news.dto';
import { UpdateNewsSubscriptionDto } from './update-news-subscription.dto';

const NEWS_KB_NAME = '资讯';

/** 用于构造携带稳定错误码的领域拒绝。 */
export function newsError(code: string, message: string, status: number): ApiDomainException {
  return new ApiDomainException({ code, kind: 'domain', message, status });
}

/** 用于把数据库行投影为公开摘要。 */
function toSummary(row: {
  created_at: Date;
  exclude_keywords: string[];
  feed_url: string;
  id: string;
  include_keywords: string[];
  latest_run_status: string | null;
  name: string;
  news_knowledge_base_id: string;
  schedule: unknown;
}): NewsSubscriptionSummary {
  const schedule =
    typeof row.schedule === 'object' && row.schedule !== null
      ? (row.schedule as NewsSubscriptionSummary['schedule'])
      : null;
  return {
    createdAt: row.created_at.toISOString(),
    excludeKeywords: row.exclude_keywords,
    feedUrl: row.feed_url,
    id: row.id,
    includeKeywords: row.include_keywords,
    latestRunStatus: row.latest_run_status,
    name: row.name,
    newsKnowledgeBaseId: row.news_knowledge_base_id,
    schedule,
  };
}

/** 用于把运行行投影为带来源决策与警告的公开摘要。 */
export function toDigestRunSummary(row: {
  brief_document_id: string | null;
  created_at: Date;
  error_code: string | null;
  id: string;
  source_results: JsonValue;
  status: string;
  subscription_id: string;
  warnings: JsonValue;
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

/** 用于持有资讯订阅切片的数据库与身份依赖。 */
@Injectable()
export class NewsService {
  /** 用于注入数据库与身份边界。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identity: LocalIdentityContext,
  ) {}

  /** 用于确保所有者存在唯一的资讯知识库并返回其 id。 */
  private async ensureNewsKnowledgeBase(ownerId: string): Promise<string> {
    const database = this.databaseService.client;
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

  /** 用于创建订阅并自动确保资讯知识库存在。 */
  async create(input: CreateNewsSubscriptionDto): Promise<NewsSubscriptionSummary> {
    const ownerId = this.identity.getActor().ownerId;
    const knowledgeBaseId = await this.ensureNewsKnowledgeBase(ownerId);
    const row = await withNewsTables(this.databaseService.client)
      .insertInto('news_subscriptions')
      .values({
        id: randomUUID(),
        owner_id: ownerId,
        name: input.name,
        feed_url: input.feedUrl,
        include_keywords: input.includeKeywords ?? [],
        exclude_keywords: input.excludeKeywords ?? [],
        schedule: (input.schedule ?? null) as JsonValue,
        news_knowledge_base_id: knowledgeBaseId,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toSummary({ ...row, latest_run_status: null });
  }

  /** 用于列出所有者的订阅及最近一次运行状态。 */
  async list(): Promise<NewsSubscriptionSummary[]> {
    const ownerId = this.identity.getActor().ownerId;
    const rows = await withNewsTables(this.databaseService.client)
      .selectFrom('news_subscriptions')
      .select((expression) => [
        'news_subscriptions.id',
        'news_subscriptions.name',
        'news_subscriptions.feed_url',
        'news_subscriptions.include_keywords',
        'news_subscriptions.exclude_keywords',
        'news_subscriptions.schedule',
        'news_subscriptions.news_knowledge_base_id',
        'news_subscriptions.created_at',
        expression
          .selectFrom('news_digest_runs as latest_run')
          .whereRef('latest_run.subscription_id', '=', 'news_subscriptions.id')
          .orderBy('latest_run.created_at', 'desc')
          .orderBy('latest_run.id', 'desc')
          .limit(1)
          .select('latest_run.status')
          .as('latest_run_status'),
      ])
      .where('owner_id', '=', ownerId)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map((row) => toSummary(row));
  }

  /** 用于按所有者约束更新订阅字段与计划。 */
  async update(id: string, input: UpdateNewsSubscriptionDto): Promise<NewsSubscriptionSummary> {
    const row = await withNewsTables(this.databaseService.client)
      .updateTable('news_subscriptions')
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.feedUrl === undefined ? {} : { feed_url: input.feedUrl }),
        ...(input.includeKeywords === undefined ? {} : { include_keywords: input.includeKeywords }),
        ...(input.excludeKeywords === undefined ? {} : { exclude_keywords: input.excludeKeywords }),
        ...(input.schedule === undefined
          ? {}
          : { schedule: (input.schedule ?? null) as JsonValue }),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('owner_id', '=', this.identity.getActor().ownerId)
      .returningAll()
      .executeTakeFirst();
    if (row === undefined) throw new NotFoundException();
    return toSummary({ ...row, latest_run_status: null });
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
}
