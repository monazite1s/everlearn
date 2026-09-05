/**
 * @fileoverview 实现限定所有者的教程会话状态机：草案、范围确认、大纲编辑与原子建库。
 */

import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import type { JsonValue } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import { ApiDomainException } from '../http-boundary/api-domain.exception';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { validateOutline } from './outline-graph';
import { createChapterPlaceholders, createTutorialKnowledgeBase } from './tutorial-provision';
import {
  buildStageView,
  pickContinueTarget,
  pickCurrentChapterId,
  readOutline,
  toChapterView,
  toScopeRow,
  toScopeView,
  toSummary,
  toStringList,
} from './tutorial-projection';
import {
  CHAPTER_MAX_ATTEMPTS_ERROR_CODE,
  MAX_CHAPTER_ATTEMPTS,
  readOutlineSummaries,
} from './tutorial-runs.helpers';
import { withTutorialTables } from './tutorial-db.types';
import type { TutorialDatabaseSchema } from './tutorial-db.types';
import type {
  TutorialDetail,
  TutorialGraph,
  TutorialKnowledgeBaseView,
  TutorialOutline,
  TutorialSummary,
} from './tutorial.dto';
import type { CreateTutorialDto } from './create-tutorial.dto';
import type { TutorialScopeDto } from './tutorial-scope.dto';

/** 用于构造携带稳定错误码的领域拒绝。 */
export function tutorialError(code: string, message: string, status: number): ApiDomainException {
  return new ApiDomainException({ code, kind: 'domain', message, status });
}

/** 用于持有教程会话切片的数据库与身份依赖。 */
@Injectable()
export class TutorialService {
  /** 用于注入数据库客户端与本地身份边界。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identity: LocalIdentityContext,
  ) {}

  /** 用于创建处于 draft_scope 态的教程草案。 */
  async create(input: CreateTutorialDto): Promise<{ id: string; status: 'draft_scope' }> {
    const ownerId = this.identity.getActor().ownerId;
    const id = randomUUID();
    // 最小创建仅主题必填，其余字段按安全默认补齐后进入范围行。
    const scope: TutorialScopeDto = {
      audience: input.audience ?? '未指定',
      depth: input.depth ?? 'standard',
      excludeTopics: input.excludeTopics ?? [],
      goals: input.goals ?? '',
      includeTopics: input.includeTopics ?? [],
      knowledgeBaseIds: input.knowledgeBaseIds ?? [],
      level: input.level ?? 50,
      topic: input.topic,
    };
    await withTutorialTables(this.databaseService.client)
      .insertInto('tutorial_sessions')
      .values({ id, owner_id: ownerId, status: 'draft_scope', ...toScopeRow(scope) })
      .executeTakeFirstOrThrow();
    return { id, status: 'draft_scope' };
  }

  /** 用于列出当前所有者的教程书架卡片（进度、知识库与继续阅读定位）。 */
  async list(): Promise<TutorialSummary[]> {
    const ownerId = this.identity.getActor().ownerId;
    const sessions = await withTutorialTables(this.databaseService.client)
      .selectFrom('tutorial_sessions')
      .select(['id', 'topic', 'status', 'created_at', 'updated_at', 'tutorial_kb_id'])
      .where('owner_id', '=', ownerId)
      .orderBy('created_at', 'desc')
      .execute();
    if (sessions.length === 0) return [];
    const chapters = await this.readChapterRowsFor(sessions.map((row) => row.id));
    const kinds = await this.readKnowledgeBaseKinds(sessions.map((row) => row.tutorial_kb_id));
    // ponytail: 列表页内存过滤章节在书架量级（<50 教程）下足够，超出后改分组聚合查询。
    return sessions.map((session) =>
      toSummary(
        session,
        chapters.filter((row) => row.session_id === session.id),
        kinds.get(session.tutorial_kb_id ?? '') ?? null,
      ),
    );
  }

  /** 用于返回会话详情，含大纲、章节摘要、进度定位与告警。 */
  async detail(id: string): Promise<TutorialDetail> {
    const ownerId = this.identity.getActor().ownerId;
    const session = await this.requireSession(ownerId, id);
    const chapters = await this.readChapterRows(id);
    const summaries = readOutlineSummaries(session.outline);
    const knowledgeBase = await this.readKnowledgeBaseRef(session.tutorial_kb_id);
    return {
      chapters: chapters.map((row) => toChapterView(row, summaries.get(row.node_key) ?? '')),
      continueTo: pickContinueTarget(chapters, session.tutorial_kb_id),
      currentChapterId: pickCurrentChapterId(chapters),
      errorCode: session.error_code,
      id: session.id,
      knowledgeBase,
      outline: readOutline(session.outline),
      scope: toScopeView(session),
      stage: buildStageView(session.status, chapters),
      status: session.status,
      tutorialKnowledgeBaseId: session.tutorial_kb_id,
      warnings: toStringList(session.warnings),
    };
  }

  /** 用于返回三视图图数据：节点与依赖边来自已确认大纲的章节行。 */
  async graph(id: string): Promise<TutorialGraph> {
    const ownerId = this.identity.getActor().ownerId;
    await this.requireSession(ownerId, id);
    const chapters = await this.readChapterRows(id);
    return {
      edges: chapters.flatMap((chapter) =>
        chapter.depends_on.map((from) => ({ from, to: chapter.node_key })),
      ),
      nodes: chapters.map((chapter) => ({
        documentId: chapter.document_id,
        nodeKey: chapter.node_key,
        status: chapter.status,
        title: chapter.title,
      })),
    };
  }

  /** 用于在 draft_scope 态整体替换研究范围。 */
  async updateScope(id: string, input: TutorialScopeDto): Promise<TutorialDetail> {
    const ownerId = this.identity.getActor().ownerId;
    const result = await withTutorialTables(this.databaseService.client)
      .updateTable('tutorial_sessions')
      .set({ ...toScopeRow(input), updated_at: new Date() })
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .where('status', '=', 'draft_scope')
      .executeTakeFirst();
    if (Number(result?.numUpdatedRows ?? 0) === 0) await this.requireNotDraftOrMissing(ownerId, id);
    return this.detail(id);
  }

  /** 用于把 draft_scope 会话推进到 researching；重复确认幂等返回同一状态。 */
  async confirmScope(id: string): Promise<TutorialDetail> {
    const ownerId = this.identity.getActor().ownerId;
    await withTutorialTables(this.databaseService.client)
      .updateTable('tutorial_sessions')
      .set({ status: 'researching', updated_at: new Date() })
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .where('status', '=', 'draft_scope')
      .executeTakeFirst();
    const session = await this.requireSession(ownerId, id);
    if (!['draft_scope', 'researching'].includes(session.status)) {
      throw tutorialError('TUTORIAL_INVALID_TRANSITION', '当前状态不可确认研究范围。', 409);
    }
    return this.detail(id);
  }

  /** 用于在 awaiting_outline 态整体替换大纲并校验依赖图。 */
  async updateOutline(id: string, outline: TutorialOutline): Promise<TutorialDetail> {
    const ownerId = this.identity.getActor().ownerId;
    const validation = validateOutline(outline);
    if (!validation.ok) {
      throw tutorialError('TUTORIAL_OUTLINE_INVALID', `大纲结构无效：${validation.issue}`, 422);
    }
    const result = await withTutorialTables(this.databaseService.client)
      .updateTable('tutorial_sessions')
      .set({ outline: JSON.stringify(outline) as unknown as JsonValue, updated_at: new Date() })
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .where('status', '=', 'awaiting_outline')
      .executeTakeFirst();
    if (Number(result?.numUpdatedRows ?? 0) === 0) {
      const session = await this.requireSession(ownerId, id);
      throw tutorialError(
        'TUTORIAL_INVALID_TRANSITION',
        `当前状态 ${session.status} 不可编辑大纲。`,
        409,
      );
    }
    return this.detail(id);
  }

  /** 用于原子创建教程知识库、占位文档并把会话推进到 generating；重复确认幂等。 */
  async confirmOutline(id: string): Promise<TutorialDetail> {
    const ownerId = this.identity.getActor().ownerId;
    await this.databaseService.client.transaction().execute(async (transaction) => {
      const tx = transaction as unknown as Kysely<TutorialDatabaseSchema>;
      const { sql } = await import('kysely');
      const lockKey = `tutorial:${id}`;
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`.execute(tx);
      const session = await tx
        .selectFrom('tutorial_sessions')
        .selectAll()
        .where('id', '=', id)
        .where('owner_id', '=', ownerId)
        .executeTakeFirst();
      if (session === undefined) throw new NotFoundException();
      if (session.tutorial_kb_id !== null) return;
      if (session.status !== 'awaiting_outline' || session.outline === null) {
        throw tutorialError('TUTORIAL_INVALID_TRANSITION', '当前状态不可确认大纲。', 409);
      }
      const kbId = await createTutorialKnowledgeBase(tx, ownerId, session.topic);
      await createChapterPlaceholders(
        { kbId, ownerId, sessionId: id, tx },
        session.outline as unknown as TutorialOutline,
      );
      await tx
        .updateTable('tutorial_sessions')
        .set({ status: 'generating', tutorial_kb_id: kbId, updated_at: new Date() })
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
    });
    return this.detail(id);
  }

  /** 用于把 failed/cancelled 章节复位为排队重试；尝试耗尽保持 failed 并标记错误码。 */
  async retryChapter(chapterId: string): Promise<{ chapterId: string }> {
    const { sql } = await import('kysely');
    const ownerId = this.identity.getActor().ownerId;
    const result = await withTutorialTables(this.databaseService.client)
      .updateTable('tutorial_chapters')
      .set({
        error_code: sql`CASE WHEN attempt < ${MAX_CHAPTER_ATTEMPTS} THEN NULL ELSE ${CHAPTER_MAX_ATTEMPTS_ERROR_CODE} END`,
        status: sql`CASE WHEN attempt < ${MAX_CHAPTER_ATTEMPTS} THEN 'queued' ELSE status END`,
        updated_at: new Date(),
      })
      .where('id', '=', chapterId)
      .where('status', 'in', ['cancelled', 'failed'])
      .where((expression) =>
        expression.exists(
          expression
            .selectFrom('tutorial_sessions')
            .select('tutorial_sessions.id')
            .whereRef('tutorial_sessions.id', '=', 'tutorial_chapters.session_id')
            .where('tutorial_sessions.owner_id', '=', ownerId),
        ),
      )
      .executeTakeFirst();
    if (Number(result?.numUpdatedRows ?? 0) === 0) {
      // 重复重试幂等：章节存在且属主时静默返回，仅缺失或越权统一 404。
      await this.requireOwnedChapter(ownerId, chapterId);
    }
    return { chapterId };
  }

  /** 用于把未开始章节置为 cancelled；进行中章节不中断。 */
  async cancel(id: string): Promise<TutorialDetail> {
    const ownerId = this.identity.getActor().ownerId;
    await this.requireSession(ownerId, id);
    await withTutorialTables(this.databaseService.client)
      .updateTable('tutorial_chapters')
      .set({ status: 'cancelled', updated_at: new Date() })
      .where('session_id', '=', id)
      .where('status', 'in', ['placeholder', 'queued'])
      .executeTakeFirst();
    await this.refreshSessionTerminalState(id);
    return this.detail(id);
  }

  /** 用于在章节终态变化后把会话推进到 completed/partial 终态。 */
  async refreshSessionTerminalState(id: string): Promise<void> {
    await this.databaseService.client.transaction().execute(async (transaction) => {
      const tx = transaction as unknown as Kysely<TutorialDatabaseSchema>;
      const session = await tx
        .selectFrom('tutorial_sessions')
        .select('id')
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (session === undefined) return;
      const chapters = await tx
        .selectFrom('tutorial_chapters')
        .select('status')
        .where('session_id', '=', id)
        .execute();
      const pending = chapters.filter((row) =>
        ['placeholder', 'queued', 'running'].includes(row.status),
      );
      if (pending.length > 0) return;
      const failed = chapters.some((row) => row.status === 'failed');
      await tx
        .updateTable('tutorial_sessions')
        .set({ status: failed ? 'partial' : 'completed', updated_at: new Date() })
        .where('id', '=', id)
        .where('status', 'in', ['generating', 'partial'])
        .executeTakeFirstOrThrow();
    });
  }

  /** 用于读取会话章节行（详情与三视图共用）。 */
  private async readChapterRows(id: string) {
    return withTutorialTables(this.databaseService.client)
      .selectFrom('tutorial_chapters')
      .select([
        'id',
        'node_key',
        'title',
        'depends_on',
        'status',
        'document_id',
        'attempt',
        'error_code',
      ])
      .where('session_id', '=', id)
      .orderBy('created_at', 'asc')
      .execute();
  }

  /** 用于批量读取多个会话的章节行（书架列表共用）。 */
  private async readChapterRowsFor(sessionIds: readonly string[]) {
    return withTutorialTables(this.databaseService.client)
      .selectFrom('tutorial_chapters')
      .select(['session_id', 'id', 'node_key', 'title', 'status', 'document_id'])
      .where(
        'session_id',
        'in',
        sessionIds.filter((value, index, all) => all.indexOf(value) === index),
      )
      .orderBy('created_at', 'asc')
      .execute();
  }

  /** 用于读取产出知识库的类型映射（书架列表共用）。 */
  private async readKnowledgeBaseKinds(
    ids: readonly (string | null)[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => id !== null))];
    if (unique.length === 0) return new Map();
    const rows = await this.databaseService.client
      .selectFrom('knowledge_bases')
      .select(['id', 'kind'])
      .where('id', 'in', unique)
      .execute();
    return new Map(rows.map((row) => [row.id, row.kind]));
  }

  /** 用于读取产出知识库引用，缺失时返回 null。 */
  private async readKnowledgeBaseRef(id: string | null): Promise<TutorialKnowledgeBaseView | null> {
    if (id === null) return null;
    const row = await this.databaseService.client
      .selectFrom('knowledge_bases')
      .select(['id', 'kind'])
      .where('id', '=', id)
      .executeTakeFirst();
    return row ?? null;
  }

  /** 用于区分重试被拒与章节不存在或越权。 */
  private async requireOwnedChapter(ownerId: string, chapterId: string): Promise<void> {
    const chapter = await withTutorialTables(this.databaseService.client)
      .selectFrom('tutorial_chapters')
      .innerJoin('tutorial_sessions', 'tutorial_sessions.id', 'tutorial_chapters.session_id')
      .select('tutorial_chapters.id')
      .where('tutorial_chapters.id', '=', chapterId)
      .where('tutorial_sessions.owner_id', '=', ownerId)
      .executeTakeFirst();
    if (chapter === undefined) throw new NotFoundException();
  }

  /** 用于按所有者读取会话行，缺失或越权时统一 404。 */
  private async requireSession(ownerId: string, id: string) {
    const session = await withTutorialTables(this.databaseService.client)
      .selectFrom('tutorial_sessions')
      .selectAll()
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .executeTakeFirst();
    if (session === undefined) throw new NotFoundException();
    return session;
  }

  /** 用于区分范围更新被拒与资源不存在两种失败。 */
  private async requireNotDraftOrMissing(ownerId: string, id: string): Promise<void> {
    const session = await this.requireSession(ownerId, id);
    throw tutorialError(
      'TUTORIAL_INVALID_TRANSITION',
      `当前状态 ${session.status} 不可修改研究范围。`,
      409,
    );
  }
}
