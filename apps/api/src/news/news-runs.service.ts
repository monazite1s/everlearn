/**
 * @fileoverview 实现 Worker 侧简报运行的领取、终态写入与计划触发。
 */

import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import { DatabaseService } from '../database/database.service';
import { CompleteNewsDigestDto } from './complete-news-digest.dto';
import { withNewsTables, type NewsDatabaseSchema } from './news-db.types';
import type { NewsDigestDispatchItem, NewsDigestRunSummary, NewsScheduleItem } from './news.dto';
import { newsError } from './news.service';

const ACTIVE_RUN_STATUSES = ['pending', 'running'] as const;

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
          'news_subscriptions.feed_url',
          'news_subscriptions.include_keywords',
          'news_subscriptions.exclude_keywords',
          'news_subscriptions.news_knowledge_base_id',
        ])
        .where('news_digest_runs.status', '=', 'pending')
        .orderBy('news_digest_runs.created_at', 'asc')
        .limit(limit)
        .forUpdate()
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
            feedUrl: row.feed_url,
            includeKeywords: row.include_keywords,
            excludeKeywords: row.exclude_keywords,
            newsKnowledgeBaseId: row.news_knowledge_base_id,
          },
          seenHashes: await this.readSeenHashes(row.run_id),
        })),
      );
    });
  }

  /** 用于读取订阅近期已见指纹供去重，上限 500 条。 */
  private async readSeenHashes(runId: string): Promise<string[]> {
    const run = await withNewsTables(this.databaseService.client)
      .selectFrom('news_digest_runs')
      .select('subscription_id')
      .where('id', '=', runId)
      .executeTakeFirst();
    if (run === undefined) return [];
    const rows = await withNewsTables(this.databaseService.client)
      .selectFrom('news_seen_items')
      .select('content_hash')
      .where('subscription_id', '=', run.subscription_id)
      .orderBy('seen_at', 'desc')
      .limit(500)
      .execute();
    return rows.map((row) => row.content_hash);
  }

  /** 用于把运行推进到终态并写入简报文档、错误码与已见条目。 */
  async completeDigestRun(runId: string, input: CompleteNewsDigestDto): Promise<void> {
    const database = withNewsTables(this.databaseService.client);
    const result = await database
      .updateTable('news_digest_runs')
      .set({
        status: input.status,
        brief_document_id: input.briefDocumentId ?? null,
        error_code: input.errorCode ?? null,
        updated_at: new Date(),
      })
      .where('id', '=', runId)
      .where('status', 'in', [...ACTIVE_RUN_STATUSES])
      .executeTakeFirst();
    const changedRows = Number(result.numUpdatedRows ?? result.numChangedRows ?? 0);
    if (changedRows === 0) {
      throw newsError('NEWS_RUN_NOT_ACTIVE', '简报运行不存在或已进入终态。', 409);
    }
    if (input.seenItems !== undefined && input.seenItems.length > 0) {
      const subscriptionId = (await this.readSubscriptionId(runId)) ?? '';
      await database
        .insertInto('news_seen_items')
        .values(
          input.seenItems.map((item) => ({
            subscription_id: subscriptionId,
            normalized_url: item.normalizedUrl,
            content_hash: item.contentHash,
          })),
        )
        .onConflict((constraint) =>
          constraint.columns(['subscription_id', 'content_hash']).doNothing(),
        )
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

  /** 用于列出启用计划的订阅。 */
  async listSchedules(): Promise<NewsScheduleItem[]> {
    const rows = await withNewsTables(this.databaseService.client)
      .selectFrom('news_subscriptions')
      .select(['id', 'schedule'])
      .where('schedule', 'is not', null)
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
