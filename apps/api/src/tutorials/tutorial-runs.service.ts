/**
 * @fileoverview 实现 Worker 侧教程大纲与章节的领取、研究上下文与终态写入。
 */

import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import type { JsonValue } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import { selectReadyChapters } from './chapter-scheduling';
import {
  CHAPTER_MAX_ATTEMPTS_ERROR_CODE,
  MAX_CHAPTER_ATTEMPTS,
  finalizeSession,
  readChapterStatusMap,
  readKbScopeTexts,
  readOutlineSummaries,
  writeChapterRevision,
} from './tutorial-runs.helpers';
import { tutorialError } from './tutorial.service';
import { withTutorialTables } from './tutorial-db.types';
import type { TutorialDatabaseSchema } from './tutorial-db.types';
import type { TutorialOutline } from './tutorial.dto';

/** 大纲研究领取的会话条目。 */
export interface OutlineDispatchItem {
  readonly audience: string;
  readonly depth: string;
  readonly excludeTopics: readonly string[];
  readonly goals: string;
  readonly includeTopics: readonly string[];
  readonly kbTexts: readonly string[];
  readonly level: number;
  readonly sessionId: string;
  readonly topic: string;
}

/** 章节生成领取的条目。 */
export interface ChapterDispatchItem {
  readonly attempt: number;
  readonly chapterId: string;
  readonly documentId: string;
  readonly kbTexts: readonly string[];
  readonly level: number;
  readonly sessionTopic: string;
  readonly summary: string;
  readonly title: string;
}

/** 大纲运行终态写入。 */
export interface OutlineCompleteInput {
  readonly errorCode?: string;
  readonly outline?: TutorialOutline;
  readonly warnings?: readonly string[];
  readonly status: 'completed' | 'failed';
}

/** 章节运行终态写入。 */
export interface ChapterCompleteInput {
  readonly errorCode?: string;
  readonly markdown?: string;
  readonly status: 'completed' | 'failed';
}

/** 领取锁时限内章节行的查询投影。 */
interface TutorialClaimRow {
  attempt: number;
  chapter_id: string;
  depends_on: string[];
  document_id: string | null;
  kb_scope: string[];
  level: number;
  node_key: string;
  outline: JsonValue;
  session_id: string;
  session_topic: string;
  title: string;
}

/** 领取锁时限（毫秒）。 */
const OUTLINE_LOCK_TTL_MS = 10 * 60 * 1000;

/** 每个知识库参与研究的纯文本截断上限。 */
export const KB_TEXT_LIMIT = 8000;

/** 用于承接 Worker 对教程状态机的迁移请求。 */
@Injectable()
export class TutorialRunsService {
  /** 用于注入数据库客户端。 */
  constructor(private readonly databaseService: DatabaseService) {}

  /** 用于原子领取处于 researching 且未持锁的会话并续锁。 */
  async claimOutlineSessions(limit: number): Promise<OutlineDispatchItem[]> {
    return this.databaseService.client.transaction().execute(async (transaction) => {
      const tx = withTutorialTables(transaction);
      const { sql } = await import('kysely');
      await sql`SELECT pg_advisory_xact_lock(hashtextextended('tutorial-outline-claim', 0))`.execute(
        tx,
      );
      const staleBefore = new Date(Date.now() - OUTLINE_LOCK_TTL_MS);
      const sessions = await tx
        .selectFrom('tutorial_sessions')
        .selectAll()
        .where('status', '=', 'researching')
        .where((expression) =>
          expression.or([
            expression('outline_locked_at', 'is', null),
            expression('outline_locked_at', '<', staleBefore),
          ]),
        )
        .orderBy('created_at', 'asc')
        .limit(limit)
        .forUpdate()
        .execute();
      if (sessions.length > 0) {
        await tx
          .updateTable('tutorial_sessions')
          .set({ outline_locked_at: new Date(), updated_at: new Date() })
          .where(
            'id',
            'in',
            sessions.map((session) => session.id),
          )
          .execute();
      }
      return Promise.all(
        sessions.map(async (session) => ({
          audience: session.audience,
          depth: session.depth,
          excludeTopics: session.exclude_topics,
          goals: session.goals,
          includeTopics: session.include_topics,
          kbTexts: await readKbScopeTexts(this.databaseService.client, session.kb_scope),
          level: session.level,
          sessionId: session.id,
          topic: session.topic,
        })),
      );
    });
  }

  /** 用于把大纲运行推进到 outline_ready/failed 并追加告警。 */
  async completeOutlineRun(sessionId: string, input: OutlineCompleteInput): Promise<void> {
    const result = await withTutorialTables(this.databaseService.client)
      .updateTable('tutorial_sessions')
      .set({
        error_code: input.errorCode ?? null,
        ...(input.outline === undefined ? {} : { outline: input.outline as unknown as JsonValue }),
        status: input.status === 'completed' ? 'awaiting_outline' : 'failed',
        updated_at: new Date(),
        ...(input.warnings === undefined
          ? {}
          : { warnings: JSON.stringify([...input.warnings]) as unknown as JsonValue }),
      })
      .where('id', '=', sessionId)
      .where('status', '=', 'researching')
      .executeTakeFirst();
    if (Number(result?.numUpdatedRows ?? 0) === 0) {
      throw tutorialError('TUTORIAL_RUN_NOT_ACTIVE', '大纲运行不存在或已进入终态。', 409);
    }
  }

  /** 用于原子领取依赖已满足的待执行章节并置为 running。 */
  async claimReadyChapters(limit: number): Promise<ChapterDispatchItem[]> {
    return this.databaseService.client.transaction().execute(async (transaction) => {
      const tx = withTutorialTables(transaction);
      const { sql } = await import('kysely');
      await sql`SELECT pg_advisory_xact_lock(hashtextextended('tutorial-chapter-claim', 0))`.execute(
        tx,
      );
      const exhaustedSessions = await this.failExhaustedChapters(tx);
      for (const sessionId of exhaustedSessions) await finalizeSession(sessionId, tx);
      const candidates = await this.readClaimCandidates(tx);
      const summaries = new Map(
        candidates.rows.map((row) => [row.session_id, readOutlineSummaries(row.outline)]),
      );
      const ready = this.filterReadyRows(candidates, limit);
      if (ready.length > 0) {
        await tx
          .updateTable('tutorial_chapters')
          .set({
            attempt: sql`attempt + 1`,
            status: 'running',
            updated_at: new Date(),
          })
          .where(
            'id',
            'in',
            ready.map((chapter) => chapter.chapter_id),
          )
          .execute();
      }
      return this.toDispatchItems(ready, summaries);
    });
  }

  /** 用于把尝试耗尽的待执行章节置为 failed 并返回受影响会话。 */
  private async failExhaustedChapters(
    tx: Kysely<TutorialDatabaseSchema>,
  ): Promise<readonly string[]> {
    const rows = await tx
      .updateTable('tutorial_chapters')
      .set({
        error_code: CHAPTER_MAX_ATTEMPTS_ERROR_CODE,
        status: 'failed',
        updated_at: new Date(),
      })
      .where('status', 'in', ['placeholder', 'queued'])
      .where('attempt', '>=', MAX_CHAPTER_ATTEMPTS)
      .returning('session_id')
      .execute();
    return [...new Set(rows.map((row) => row.session_id))];
  }

  /** 用于把领取行筛选为依赖已满足的前 limit 个。 */
  private filterReadyRows(
    candidates: { rows: TutorialClaimRow[]; statuses: Map<string, string> },
    limit: number,
  ): TutorialClaimRow[] {
    const readyIds = new Set(
      selectReadyChapters(
        candidates.rows.map((row) => ({
          chapterId: row.chapter_id,
          dependsOn: row.depends_on,
          nodeKey: row.node_key,
          sessionId: row.session_id,
        })),
        candidates.statuses,
      ).map((chapter) => chapter.chapterId),
    );
    return candidates.rows.filter((row) => readyIds.has(row.chapter_id)).slice(0, limit);
  }

  /** 用于读取待执行章节行及其会话章节状态映射。 */
  private async readClaimCandidates(tx: Kysely<TutorialDatabaseSchema>): Promise<{
    rows: TutorialClaimRow[];
    statuses: Map<string, string>;
  }> {
    const rows = await tx
      .selectFrom('tutorial_chapters')
      .innerJoin('tutorial_sessions', 'tutorial_sessions.id', 'tutorial_chapters.session_id')
      .select([
        'tutorial_chapters.attempt',
        'tutorial_chapters.depends_on',
        'tutorial_chapters.document_id',
        'tutorial_chapters.id as chapter_id',
        'tutorial_chapters.node_key',
        'tutorial_chapters.session_id',
        'tutorial_chapters.title',
        'tutorial_sessions.kb_scope',
        'tutorial_sessions.level',
        'tutorial_sessions.outline',
        'tutorial_sessions.topic as session_topic',
      ])
      .where('tutorial_chapters.status', 'in', ['placeholder', 'queued'])
      .where('tutorial_sessions.status', 'in', ['generating', 'partial'])
      .execute();
    const statuses = await readChapterStatusMap(
      tx,
      rows.map((row) => row.session_id),
    );
    return { rows, statuses };
  }

  /** 用于把领取行投影为执行器条目。 */
  private async toDispatchItems(
    ready: TutorialClaimRow[],
    summaries: Map<string, Map<string, string>>,
  ): Promise<ChapterDispatchItem[]> {
    return Promise.all(
      ready.map(async (chapter) => ({
        attempt: chapter.attempt + 1,
        chapterId: chapter.chapter_id,
        documentId: chapter.document_id ?? '',
        kbTexts: await readKbScopeTexts(this.databaseService.client, chapter.kb_scope),
        level: chapter.level,
        sessionTopic: chapter.session_topic,
        summary: summaries.get(chapter.session_id)?.get(chapter.node_key) ?? '',
        title: chapter.title,
      })),
    );
  }

  /** 用于把章节推进到终态：成功时把 Markdown 写入占位文档新修订。 */
  async completeChapter(chapterId: string, input: ChapterCompleteInput): Promise<void> {
    await this.databaseService.client.transaction().execute(async (transaction) => {
      const tx = withTutorialTables(transaction);
      const chapter = await tx
        .selectFrom('tutorial_chapters')
        .select(['document_id', 'session_id', 'title'])
        .where('id', '=', chapterId)
        .where('status', '=', 'running')
        .forUpdate()
        .executeTakeFirst();
      if (chapter === undefined) {
        throw tutorialError('TUTORIAL_RUN_NOT_ACTIVE', '章节运行不存在或已进入终态。', 409);
      }
      await tx
        .updateTable('tutorial_chapters')
        .set({ error_code: input.errorCode ?? null, status: input.status, updated_at: new Date() })
        .where('id', '=', chapterId)
        .executeTakeFirstOrThrow();
      if (input.status === 'completed' && chapter.document_id !== null) {
        await writeChapterRevision(tx, {
          documentId: chapter.document_id,
          markdown: input.markdown ?? '',
          source: 'automation',
          title: chapter.title,
        });
      }
      await finalizeSession(chapter.session_id, tx);
    });
  }
}
