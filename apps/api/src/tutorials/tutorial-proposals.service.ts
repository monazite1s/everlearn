/**
 * @fileoverview 实现对话提案的接受、拒绝与章节差异接受副作用（accept 幂等）。
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import { DatabaseService } from '../database/database.service';
import { LocalIdentityContext } from '../identity/local-identity.context';
import {
  requireNoManualEdits,
  writeAcceptedChapterRevision,
  writeConfirmedChapterDiff,
} from './compose/chapter-revision';
import type { ComposeProposal, ComposeProposalKind } from './compose/compose-agent';
import type { TutorialChapterDiffView, TutorialProposalAcceptView } from './conversation.dto';
import { validateOutline } from './outline-graph';
import { tutorialError } from './tutorial.service';
import { TutorialService } from './tutorial.service';
import { withTutorialTables, type TutorialDatabaseSchema } from './tutorial-db.types';
import type { TutorialOutline, TutorialOutlineChapter } from './tutorial.dto';
import type { TutorialScopeDto } from './tutorial-scope.dto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** 用于持有提案副作用的数据库、身份与教程状态机依赖。 */
@Injectable()
export class TutorialProposalsService {
  /** 用于注入数据库客户端、本地身份边界与教程应用服务。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identity: LocalIdentityContext,
    private readonly tutorialService: TutorialService,
  ) {}

  /** 用于按提案类型执行副作用；重复接受跳过执行并返回同形态结果。 */
  async accept(sessionId: string, messageId: string): Promise<TutorialProposalAcceptView> {
    const proposal = await this.claimAccepted(sessionId, messageId);
    if (proposal !== null) {
      try {
        await this.applyProposal(sessionId, proposal.kind, proposal.payload);
      } catch (error: unknown) {
        await this.revertClaim(messageId);
        throw error;
      }
    }
    return { proposalStatus: 'accepted', tutorial: await this.tutorialService.detail(sessionId) };
  }

  /** 用于拒绝提案：仅置状态，无任何副作用。 */
  async reject(sessionId: string, messageId: string): Promise<{ proposalStatus: 'rejected' }> {
    await this.claimProposal(sessionId, messageId, 'rejected');
    return { proposalStatus: 'rejected' };
  }

  /** 用于在用户确认差异后以 manual 来源覆盖写入章节内容。 */
  async acceptDiff(
    sessionId: string,
    chapterId: string,
    content: string,
  ): Promise<TutorialChapterDiffView> {
    const ownerId = this.identity.getActor().ownerId;
    const session = await withTutorialTables(this.databaseService.client)
      .selectFrom('tutorial_sessions')
      .select('id')
      .where('id', '=', sessionId)
      .where('owner_id', '=', ownerId)
      .executeTakeFirst();
    if (session === undefined) throw new NotFoundException();
    return this.databaseService.client.transaction().execute(async (transaction) => {
      const tx = withTutorialTables(transaction);
      const chapter = await tx
        .selectFrom('tutorial_chapters')
        .select(['document_id', 'title'])
        .where('id', '=', chapterId)
        .where('session_id', '=', sessionId)
        .executeTakeFirst();
      if (chapter?.document_id == null) {
        throw tutorialError('TUTORIAL_CHAPTER_NOT_READY', '章节文档尚未创建，无法接受差异。', 409);
      }
      const revisionNumber = await writeConfirmedChapterDiff(
        tx,
        { documentId: chapter.document_id, title: chapter.title },
        content,
      );
      return { chapterId, documentId: chapter.document_id, revisionNumber };
    });
  }

  /** 用于原子认领 pending 提案；已处于目标状态返回 null，非法状态抛 409。 */
  private async claimProposal(
    sessionId: string,
    messageId: string,
    status: 'accepted' | 'rejected',
  ): Promise<ComposeProposal | null> {
    const message = await this.requireMessage(sessionId, messageId);
    const claim = await withTutorialTables(this.databaseService.client)
      .updateTable('tutorial_messages')
      .set({ proposal_status: status })
      .where('id', '=', messageId)
      .where('proposal_status', '=', 'pending')
      .executeTakeFirst();
    if (Number(claim?.numUpdatedRows ?? 0) > 0) return message.proposal;
    return this.resolveClaim(sessionId, messageId, status);
  }

  /** 用于认领接受提案，并把同教程同类其它 pending 提案同事务置为 superseded。 */
  private async claimAccepted(
    sessionId: string,
    messageId: string,
  ): Promise<ComposeProposal | null> {
    const message = await this.requireMessage(sessionId, messageId);
    const kind = message.proposal.kind;
    return this.databaseService.client.transaction().execute(async (transaction) => {
      const tx = withTutorialTables(transaction);
      const claim = await tx
        .updateTable('tutorial_messages')
        .set({ proposal_status: 'accepted' })
        .where('id', '=', messageId)
        .where('proposal_status', '=', 'pending')
        .executeTakeFirst();
      if (Number(claim?.numUpdatedRows ?? 0) === 0) {
        return this.resolveClaim(sessionId, messageId, 'accepted');
      }
      await this.supersedeSameKind(tx, sessionId, messageId, kind);
      return message.proposal;
    });
  }

  /** 用于把同教程同类其它 pending 提案置为 superseded，避免过期意图再被接受。 */
  private async supersedeSameKind(
    tx: Kysely<TutorialDatabaseSchema>,
    sessionId: string,
    acceptedMessageId: string,
    kind: ComposeProposalKind,
  ): Promise<void> {
    const { sql } = await import('kysely');
    await tx
      .updateTable('tutorial_messages')
      .set({ proposal_status: 'superseded' })
      .where('id', '<>', acceptedMessageId)
      .where('proposal_status', '=', 'pending')
      .where('conversation_id', 'in', (eb) =>
        eb.selectFrom('tutorial_conversations').select('id').where('session_id', '=', sessionId),
      )
      .where(sql`proposal->>'kind'`, '=', kind)
      .execute();
  }

  /** 用于在认领未生效时按当前状态判幂等返回或抛 409。 */
  private async resolveClaim(
    sessionId: string,
    messageId: string,
    status: 'accepted' | 'rejected',
  ): Promise<ComposeProposal | null> {
    const current = await this.requireMessage(sessionId, messageId);
    if (current.status === status) return null;
    throw tutorialError(
      'TUTORIAL_PROPOSAL_NOT_PENDING',
      `提案当前状态 ${current.status} 不可执行该操作。`,
      409,
    );
  }

  /** 用于把副作用失败前的认领回退为 pending。 */
  private async revertClaim(messageId: string): Promise<void> {
    await withTutorialTables(this.databaseService.client)
      .updateTable('tutorial_messages')
      .set({ proposal_status: 'pending' })
      .where('id', '=', messageId)
      .where('proposal_status', '=', 'accepted')
      .executeTakeFirst();
  }

  /** 用于按提案类型分发副作用。 */
  private async applyProposal(
    sessionId: string,
    kind: ComposeProposalKind,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (kind === 'scope') {
      await this.applyScopeProposal(sessionId, payload);
      return;
    }
    if (kind === 'outline') {
      await this.applyOutlineProposal(sessionId, payload);
      return;
    }
    await this.applyChapterProposal(sessionId, payload);
  }

  /** 用于执行范围提案：更新范围并确认入队研究。 */
  private async applyScopeProposal(
    sessionId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const scope = toScopeDto(payload);
    await this.tutorialService.updateScope(sessionId, scope);
    await this.tutorialService.confirmScope(sessionId);
  }

  /** 用于执行大纲提案：更新大纲并原子建库。 */
  private async applyOutlineProposal(
    sessionId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const outline = toOutline(payload);
    await this.tutorialService.updateOutline(sessionId, outline);
    await this.tutorialService.confirmOutline(sessionId);
  }

  /** 用于执行章节提案：占位授权检测通过后写入新修订。 */
  private async applyChapterProposal(
    sessionId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const { markdown, nodeKey } = readChapterPayload(payload);
    await this.databaseService.client.transaction().execute(async (transaction) => {
      const tx = withTutorialTables(transaction);
      const chapter = await tx
        .selectFrom('tutorial_chapters')
        .select(['document_id', 'title'])
        .where('session_id', '=', sessionId)
        .where('node_key', '=', nodeKey)
        .executeTakeFirst();
      if (chapter === undefined) {
        throw tutorialError('TUTORIAL_CHAPTER_NOT_FOUND', '章节不存在。', 404);
      }
      if (chapter.document_id === null) {
        throw tutorialError('TUTORIAL_CHAPTER_NOT_READY', '章节文档尚未创建。', 409);
      }
      const target = await requireNoManualEdits(tx, chapter.document_id);
      await writeAcceptedChapterRevision(tx, target, markdown);
    });
  }

  /** 用于读取并校验提案消息的归属与结构。 */
  private async requireMessage(
    sessionId: string,
    messageId: string,
  ): Promise<{ proposal: ComposeProposal; status: string | null }> {
    const ownerId = this.identity.getActor().ownerId;
    const row = await withTutorialTables(this.databaseService.client)
      .selectFrom('tutorial_messages')
      .innerJoin(
        'tutorial_conversations',
        'tutorial_conversations.id',
        'tutorial_messages.conversation_id',
      )
      .innerJoin('tutorial_sessions', 'tutorial_sessions.id', 'tutorial_conversations.session_id')
      .select(['tutorial_messages.proposal', 'tutorial_messages.proposal_status'])
      .where('tutorial_messages.id', '=', messageId)
      .where('tutorial_sessions.id', '=', sessionId)
      .where('tutorial_sessions.owner_id', '=', ownerId)
      .executeTakeFirst();
    if (row === undefined) throw new NotFoundException();
    const proposal = row.proposal as ComposeProposal | null;
    if (
      proposal === null ||
      typeof proposal !== 'object' ||
      !isProposalKind(proposal.kind) ||
      typeof proposal.payload !== 'object' ||
      proposal.payload === null
    ) {
      throw tutorialError('TUTORIAL_PROPOSAL_MISSING', '该消息不携带可执行提案。', 422);
    }
    return { proposal, status: row.proposal_status };
  }
}

/** 提案载荷中章节内容的解析结果。 */
interface ChapterPayload {
  readonly markdown: string;
  readonly nodeKey: string;
}

/** 用于判断未知值是否为合法提案类型。 */
function isProposalKind(value: unknown): value is ComposeProposalKind {
  return value === 'scope' || value === 'outline' || value === 'chapter';
}

/** 用于读取章节提案载荷并校验必填字段。 */
function readChapterPayload(payload: Record<string, unknown>): ChapterPayload {
  const { markdown, nodeKey } = payload;
  if (typeof nodeKey !== 'string' || typeof markdown !== 'string' || markdown.trim().length === 0) {
    throw tutorialError('TUTORIAL_PROPOSAL_INVALID', '章节提案缺少 nodeKey 或 markdown。', 422);
  }
  return { markdown, nodeKey };
}

/** 用于读取非空字符串字段，缺失时返回 null。 */
function readText(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/** 用于读取深度字段，未知值回退 standard。 */
function readDepth(value: unknown): TutorialScopeDto['depth'] {
  return value === 'deep' || value === 'overview' || value === 'standard' ? value : 'standard';
}

/** 用于读取水平字段，越界或缺失时回退 50。 */
function readLevel(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100
    ? value
    : 50;
}

/** 用于读取字符串列表字段，缺失时返回空数组。 */
function readList(value: unknown): string[] {
  return isStringList(value) ? value : [];
}

/** 用于把范围提案载荷规范化为范围 DTO；缺省字段按安全默认值补齐。 */
function toScopeDto(payload: Record<string, unknown>): TutorialScopeDto {
  const topic = readText(payload.topic);
  const audience = readText(payload.audience);
  if (topic === null || audience === null) {
    throw tutorialError('TUTORIAL_PROPOSAL_INVALID', '范围提案缺少主题或受众。', 422);
  }
  return {
    audience,
    depth: readDepth(payload.depth),
    excludeTopics: readList(payload.excludeTopics),
    goals: typeof payload.goals === 'string' ? payload.goals : '',
    includeTopics: readList(payload.includeTopics),
    knowledgeBaseIds: readList(payload.knowledgeBaseIds).filter((id) => UUID_PATTERN.test(id)),
    level: readLevel(payload.level),
    topic,
  };
}

/** 用于把大纲提案载荷规范化为大纲结构并校验依赖图。 */
function toOutline(payload: Record<string, unknown>): TutorialOutline {
  const chapters = Array.isArray(payload.chapters) ? payload.chapters : [];
  const mapped = chapters.flatMap((chapter) => {
    if (typeof chapter !== 'object' || chapter === null) return [];
    const record = chapter as Record<string, unknown>;
    if (typeof record.nodeKey !== 'string' || typeof record.title !== 'string') return [];
    const mappedChapter: TutorialOutlineChapter = {
      dependsOn: isStringList(record.dependsOn) ? record.dependsOn : [],
      nodeKey: record.nodeKey,
      title: record.title,
    };
    if (typeof record.summary === 'string') {
      return [{ ...mappedChapter, summary: record.summary }];
    }
    return [mappedChapter];
  });
  const outline: TutorialOutline = { chapters: mapped };
  if (!validateOutline(outline).ok) {
    throw tutorialError('TUTORIAL_PROPOSAL_INVALID', '大纲提案结构无效。', 422);
  }
  return outline;
}

/** 用于判断未知值是否为字符串数组。 */
function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
