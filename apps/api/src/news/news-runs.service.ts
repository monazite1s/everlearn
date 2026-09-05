/**
 * @fileoverview 实现 Worker 侧简报运行的领取、条目登记、终态写入与计划触发。
 */

import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import { DatabaseService } from '../database/database.service';
import type { Json } from '../database/database.types';
import { CompleteNewsDigestDto } from './complete-news-digest.dto';
import type { RegisteredNewsRunItem } from './register-news-run-items.dto';
import { withNewsTables, type NewsDatabaseSchema } from './news-db.types';
import type { NewsDigestDispatchItem, NewsDigestRunSummary, NewsScheduleItem } from './news.dto';
import { newsError } from './news.service.helpers';

const ACTIVE_RUN_STATUSES = ['pending', 'running'] as const;
const RECENT_ITEM_LIMIT = 20;

/** 用于承接 Worker 对简报运行状态机的迁移请求。 */
@Injectable()
export class NewsRunsService {
  /** 用于注入数据库客户端。 */
  constructor(private readonly databaseService: DatabaseService) {}

  /** 用于原子领取待执行简报运行并固化为 running。 */
  async claimPendingDigestRuns(limit: number): Promise<NewsDigestDispatchItem[]> {
    return this.databaseService.client.transaction().execute(async (transaction) => {
      const database = transaction as unknown as Kysely<NewsDatabaseSchema>;
      const pending = await database
        .selectFrom('news_digest_runs')
        .innerJoin(
          'news_subscriptions',
          'news_subscriptions.id',
          'news_digest_runs.subscription_id',
        )
        .select([
          'news_digest_runs.id as run_id',
          'news_digest_runs.subscription_id',
          'news_subscriptions.include_keywords',
          'news_subscriptions.exclude_keywords',
          'news_subscriptions.name',
          'news_subscriptions.topic',
          'news_subscriptions.news_knowledge_base_id',
        ])
        .where('news_digest_runs.status', '=', 'pending')
        .orderBy('news_digest_runs.created_at', 'asc')
        .limit(limit)
        .forUpdate()
        .skipLocked()
        .execute();
      const runIds = pending.map((row) => row.run_id);
      if (runIds.length > 0) {
        await database
          .updateTable('news_digest_runs')
          .set({ status: 'running', updated_at: new Date() })
          .where('id', 'in', runIds)
          .execute();
      }
      return Promise.all(
        pending.map(async (row) => ({
          runId: row.run_id,
          subscription: {
            excludeKeywords: row.exclude_keywords,
            includeKeywords: row.include_keywords,
            name: row.name,
            newsKnowledgeBaseId: row.news_knowledge_base_id,
            sources: await this.readSubscriptionSources(row.subscription_id),
            topic: row.topic,
          },
          seenHashes: await this.readSeenHashes(row.subscription_id),
          recentItemTitles: await this.readRecentItemTitles(row.subscription_id),
        })),
      );
    });
  }

  /** 用于读取订阅的多来源配置。 */
  private async readSubscriptionSources(
    subscriptionId: string,
  ): Promise<NewsDigestDispatchItem['subscription']['sources']> {
    const rows = await withNewsTables(this.databaseService.client)
      .selectFrom('news_sources')
      .select(['type', 'value'])
      .where('subscription_id', '=', subscriptionId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map((row) => ({
      type: row.type as 'rss' | 'search' | 'site',
      value: row.value,
    }));
  }

  /** 用于读取订阅近期条目指纹供去重，上限 500 条。 */
  private async readSeenHashes(subscriptionId: string): Promise<string[]> {
    const rows = await withNewsTables(this.databaseService.client)
      .selectFrom('news_items')
      .select('content_fingerprint')
      .where('subscription_id', '=', subscriptionId)
      .orderBy('discovered_at', 'desc')
      .limit(500)
      .execute();
    return rows.map((row) => row.content_fingerprint);
  }

  /** 用于读取订阅近期条目标题供重要性评定对照。 */
  private async readRecentItemTitles(subscriptionId: string): Promise<string[]> {
    const rows = await withNewsTables(this.databaseService.client)
      .selectFrom('news_items')
      .select('title')
      .where('subscription_id', '=', subscriptionId)
      .orderBy('discovered_at', 'desc')
      .limit(RECENT_ITEM_LIMIT)
      .execute();
    return rows.map((row) => row.title);
  }

  /** 用于在发现新条目时按指纹去重登记资讯条目并返回指纹到条目 id 的映射。 */
  async registerRunItems(
    runId: string,
    items: {
      contentFingerprint: string;
      processedContent?: string;
      publishedAt?: string | null;
      snippet?: string;
      sourceType: 'rss' | 'search';
      title: string;
      url: string;
    }[],
  ): Promise<RegisteredNewsRunItem[]> {
    if (items.length === 0) return [];
    const database = withNewsTables(this.databaseService.client);
    const context = await this.readActiveRunContext(database, runId);
    await this.insertRunItems(database, context, runId, items);
    return this.mapStoredItemIds(database, context.subscriptionId, items);
  }

  /** 用于读取活跃运行的订阅与所有者上下文，运行缺失或已终态时拒绝。 */
  private async readActiveRunContext(
    database: Kysely<NewsDatabaseSchema>,
    runId: string,
  ): Promise<{ ownerId: string; subscriptionId: string; topic: string }> {
    const run = await database
      .selectFrom('news_digest_runs')
      .select(['subscription_id', 'status'])
      .where('id', '=', runId)
      .executeTakeFirst();
    if (run === undefined || !ACTIVE_RUN_STATUSES.includes(run.status as 'pending')) {
      throw newsError('NEWS_RUN_NOT_ACTIVE', '简报运行不存在或已进入终态。', 409);
    }
    const subscription = await database
      .selectFrom('news_subscriptions')
      .select(['owner_id', 'topic', 'name'])
      .where('id', '=', run.subscription_id)
      .executeTakeFirstOrThrow();
    return {
      ownerId: subscription.owner_id,
      subscriptionId: run.subscription_id,
      topic: subscription.topic === '' ? subscription.name : subscription.topic,
    };
  }

  /** 用于以订阅主题快照批量写入条目并按订阅内指纹去重。 */
  private async insertRunItems(
    database: Kysely<NewsDatabaseSchema>,
    context: { ownerId: string; subscriptionId: string; topic: string },
    runId: string,
    items: {
      contentFingerprint: string;
      processedContent?: string;
      publishedAt?: string | null;
      snippet?: string;
      sourceType: 'rss' | 'search';
      title: string;
      url: string;
    }[],
  ): Promise<void> {
    const discoveredAt = new Date();
    await database
      .insertInto('news_items')
      .values(
        items.map((item) => ({
          id: randomUUID(),
          subscription_id: context.subscriptionId,
          owner_id: context.ownerId,
          url: item.url,
          title: item.title,
          snippet: item.snippet ?? '',
          processed_content: (item.processedContent ?? '').slice(0, 2000),
          topic: context.topic,
          source_type: item.sourceType,
          relevance: 'accepted',
          importance: 'normal',
          published_at:
            item.publishedAt === undefined || item.publishedAt === null
              ? null
              : new Date(item.publishedAt),
          discovered_at: discoveredAt,
          content_fingerprint: item.contentFingerprint,
          discovered_run_id: runId,
        })),
      )
      .onConflict((constraint) =>
        constraint.columns(['subscription_id', 'content_fingerprint']).doNothing(),
      )
      .execute();
  }

  /** 用于按指纹集合读取已登记条目并映射为指纹到 id 的列表。 */
  private async mapStoredItemIds(
    database: Kysely<NewsDatabaseSchema>,
    subscriptionId: string,
    items: { contentFingerprint: string }[],
  ): Promise<RegisteredNewsRunItem[]> {
    const stored = await database
      .selectFrom('news_items')
      .select(['id', 'content_fingerprint'])
      .where(
        'content_fingerprint',
        'in',
        items.map((item) => item.contentFingerprint),
      )
      .where('subscription_id', '=', subscriptionId)
      .execute();
    return stored.map((row) => ({ contentFingerprint: row.content_fingerprint, id: row.id }));
  }

  /** 用于在同一事务内把运行推进到终态并回写条目重要性、文档关联、错误码与来源决策。 */
  async completeDigestRun(runId: string, input: CompleteNewsDigestDto): Promise<void> {
    await this.databaseService.client.transaction().execute(async (transaction) => {
      const database = withNewsTables(transaction);
      const subscriptionId = await this.readSubscriptionId(runId);
      const result = await database
        .updateTable('news_digest_runs')
        .set({
          status: input.status,
          brief_document_id: input.briefDocumentId ?? null,
          error_code: input.errorCode ?? null,
          source_results: JSON.stringify(input.sourceResults ?? []) as unknown as Json,
          updated_at: new Date(),
          warnings: JSON.stringify(input.warnings ?? []) as unknown as Json,
        })
        .where('id', '=', runId)
        .where('status', 'in', [...ACTIVE_RUN_STATUSES])
        .executeTakeFirst();
      const changedRows = Number(result.numUpdatedRows ?? result.numChangedRows ?? 0);
      if (changedRows === 0) {
        throw newsError('NEWS_RUN_NOT_ACTIVE', '简报运行不存在或已进入终态。', 409);
      }
      if (subscriptionId !== null) await this.applyItemResults(database, subscriptionId, input);
      if (input.status === 'failed') await this.deleteFailedRunResidue(database, runId);
    });
  }

  /** 用于把本次运行的重要性评定、摘要与相关性拒绝更新到已登记条目上。 */
  private async applyItemResults(
    database: Kysely<NewsDatabaseSchema>,
    subscriptionId: string,
    input: CompleteNewsDigestDto,
  ): Promise<void> {
    for (const item of input.itemImportance ?? []) {
      await database
        .updateTable('news_items')
        .set({
          importance: item.importance,
          ...(item.processedContent !== undefined && item.processedContent.length > 0
            ? { processed_content: item.processedContent.slice(0, 2000) }
            : {}),
        })
        .where('id', '=', item.itemId)
        .where('subscription_id', '=', subscriptionId)
        .execute();
    }
    if ((input.rejectedItemIds?.length ?? 0) > 0) {
      await database
        .updateTable('news_items')
        .set({ importance: null, relevance: 'rejected' })
        .where('id', 'in', input.rejectedItemIds!)
        .where('subscription_id', '=', subscriptionId)
        .execute();
    }
  }

  /** 用于读取运行所属订阅 id。 */
  private async readSubscriptionId(runId: string): Promise<string | null> {
    const row = await withNewsTables(this.databaseService.client)
      .selectFrom('news_digest_runs')
      .select('subscription_id')
      .where('id', '=', runId)
      .executeTakeFirst();
    return row?.subscription_id ?? null;
  }

  /** 用于删除失败 run 登记且未被显式拒绝的条目，使其退出条目流与重试去重集合。 */
  private async deleteFailedRunResidue(
    database: Kysely<NewsDatabaseSchema>,
    runId: string,
  ): Promise<void> {
    // ponytail: 失败 run 的残留以删除而非置 rejected 收敛，避免重试 run 撞订阅内指纹唯一约束；
    // 升级条件为需要审计失败 run 的原始采集时改为软隐藏并放开登记冲突翻回。
    await database
      .deleteFrom('news_items')
      .where('discovered_run_id', '=', runId)
      .where('relevance', '=', 'accepted')
      .execute();
  }

  /** 用于列出启用且配置了计划的订阅。 */
  async listSchedules(): Promise<NewsScheduleItem[]> {
    const rows = await withNewsTables(this.databaseService.client)
      .selectFrom('news_subscriptions')
      .select(['id', 'schedule'])
      .where('schedule', 'is not', null)
      .where('enabled', '=', true)
      .execute();
    return rows.flatMap((row) => {
      const schedule = row.schedule as unknown as NewsScheduleItem['schedule'] | null;
      if (schedule === null || typeof schedule !== 'object') return [];
      return [{ schedule, subscriptionId: row.id }];
    });
  }

  /** 用于为计划触发创建待执行简报运行。 */
  async createScheduledDigest(subscriptionId: string): Promise<{ runId: string }> {
    const subscription = await withNewsTables(this.databaseService.client)
      .selectFrom('news_subscriptions')
      .select('owner_id')
      .where('id', '=', subscriptionId)
      .executeTakeFirst();
    if (subscription === undefined) throw new NotFoundException();
    // ponytail: 以「当天已有运行即跳过」近似 scheduleId+scheduledAt 幂等；升级条件为出现跨天重放或错过补跑需求。
    const today = await withNewsTables(this.databaseService.client)
      .selectFrom('news_digest_runs')
      .select('id')
      .where('subscription_id', '=', subscriptionId)
      .where('created_at', '>=', new Date(new Date().toISOString().slice(0, 10)))
      .limit(1)
      .executeTakeFirst();
    if (today !== undefined) return { runId: today.id };
    return { runId: await this.insertPendingRun(subscriptionId, subscription.owner_id) };
  }

  /** 用于写入一条待执行简报运行并返回其 id。 */
  private async insertPendingRun(
    subscriptionId: string,
    ownerId: string,
  ): Promise<NewsDigestRunSummary['id']> {
    const id = randomUUID();
    await withNewsTables(this.databaseService.client)
      .insertInto('news_digest_runs')
      .values({ id, subscription_id: subscriptionId, owner_id: ownerId, status: 'pending' })
      .executeTakeFirstOrThrow();
    return id;
  }
}
