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
  readOutline,
  toChapterView,
  toScopeRow,
  toScopeView,
  toStringList,
} from './tutorial-projection';
import { withTutorialTables } from './tutorial-db.types';
import type { TutorialDatabaseSchema } from './tutorial-db.types';
import type {
  TutorialChapterCounts,
  TutorialDetail,
  TutorialOutline,
  TutorialSummary,
} from './tutorial.dto';
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

  /** 用于创建处于 draft 态的教程草案。 */
  async create(input: TutorialScopeDto): Promise<{ id: string; status: 'draft' }> {
    const ownerId = this.identity.getActor().ownerId;
    const id = randomUUID();
    await withTutorialTables(this.databaseService.client)
      .insertInto('tutorial_sessions')
      .values({ id, owner_id: ownerId, status: 'draft', ...toScopeRow(input) })
      .executeTakeFirstOrThrow();
    return { id, status: 'draft' };
  }

  /** 用于列出当前所有者的教程会话与章节计数。 */
  async list(): Promise<TutorialSummary[]> {
    const ownerId = this.identity.getActor().ownerId;
    const rows = await withTutorialTables(this.databaseService.client)
      .selectFrom('tutorial_sessions')
      .select(['id', 'topic', 'status', 'created_at'])
      .where('owner_id', '=', ownerId)
      .orderBy('created_at', 'desc')
      .execute();
    return Promise.all(
      rows.map(async (row) => ({
        chapterCounts: await this.readChapterCounts(row.id),
        createdAt: row.created_at.toISOString(),
        id: row.id,
        status: row.status,
        topic: row.topic,
      })),
    );
  }

  /** 用于返回会话详情，含大纲、章节与告警。 */
  async detail(id: string): Promise<TutorialDetail> {
    const ownerId = this.identity.getActor().ownerId;
    const session = await this.requireSession(ownerId, id);
    const chapters = await withTutorialTables(this.databaseService.client)
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
    return {
      scope: toScopeView(session),
      chapters: chapters.map(toChapterView),
      errorCode: session.error_code,
      id: session.id,
      outline: readOutline(session.outline),
      status: session.status,
      tutorialKnowledgeBaseId: session.tutorial_kb_id,
      warnings: toStringList(session.warnings),
    };
  }

  /** 用于在 draft 态整体替换研究范围。 */
  async updateScope(id: string, input: TutorialScopeDto): Promise<TutorialDetail> {
    const ownerId = this.identity.getActor().ownerId;
    const result = await withTutorialTables(this.databaseService.client)
      .updateTable('tutorial_sessions')
      .set({ ...toScopeRow(input), updated_at: new Date() })
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .where('status', '=', 'draft')
      .executeTakeFirst();
    if (Number(result?.numUpdatedRows ?? 0) === 0) await this.requireNotDraftOrMissing(ownerId, id);
    return this.detail(id);
  }

  /** 用于把 draft 会话推进到 researching；重复确认幂等返回同一状态。 */
  async confirmScope(id: string): Promise<TutorialDetail> {
    const ownerId = this.identity.getActor().ownerId;
    await withTutorialTables(this.databaseService.client)
      .updateTable('tutorial_sessions')
      .set({ status: 'researching', updated_at: new Date() })
      .where('id', '=', id)
      .where('owner_id', '=', ownerId)
      .where('status', '=', 'draft')
      .executeTakeFirst();
    const session = await this.requireSession(ownerId, id);
    if (!['draft', 'researching'].includes(session.status)) {
      throw tutorialError('TUTORIAL_INVALID_TRANSITION', '当前状态不可确认研究范围。', 409);
    }
    return this.detail(id);
  }

  /** 用于在 outline_ready 态整体替换大纲并校验依赖图。 */
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
      .where('status', '=', 'outline_ready')
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
      if (session.status !== 'outline_ready' || session.outline === null) {
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

  /** 用于把 failed/canceled 章节复位为待执行；重复请求幂等不重复入队。 */
  async retryChapter(id: string, chapterId: string): Promise<TutorialDetail> {
    const ownerId = this.identity.getActor().ownerId;
    await this.requireSession(ownerId, id);
    await withTutorialTables(this.databaseService.client)
      .updateTable('tutorial_chapters')
      .set({ status: 'pending', error_code: null, updated_at: new Date() })
      .where('id', '=', chapterId)
      .where('session_id', '=', id)
      .where('status', 'in', ['canceled', 'failed'])
      .executeTakeFirst();
    return this.detail(id);
  }

  /** 用于把未开始章节置为 canceled；进行中章节不中断。 */
  async cancel(id: string): Promise<TutorialDetail> {
    const ownerId = this.identity.getActor().ownerId;
    await this.requireSession(ownerId, id);
    await withTutorialTables(this.databaseService.client)
      .updateTable('tutorial_chapters')
      .set({ status: 'canceled', updated_at: new Date() })
      .where('session_id', '=', id)
      .where('status', '=', 'pending')
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
      const pending = chapters.filter((row) => ['pending', 'generating'].includes(row.status));
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

  /** 用于统计章节状态计数。 */
  private async readChapterCounts(id: string): Promise<TutorialChapterCounts> {
    const rows = await withTutorialTables(this.databaseService.client)
      .selectFrom('tutorial_chapters')
      .select(['status'])
      .where('session_id', '=', id)
      .execute();
    // ponytail: O(n) 三次过滤在章节量级（<100）下足够，升级条件为列表页出现性能反馈。
    /** 用于按状态统计章节数。 */
    const count = (status: string) => rows.filter((row) => row.status === status).length;
    return {
      failed: count('failed'),
      pending: count('pending') + count('generating'),
      succeeded: count('succeeded'),
      total: rows.length,
    };
  }
}
