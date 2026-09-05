/**
 * @fileoverview 实现教程对话会话的创建复用、消息读取与 Agent 回复生成。
 */

import { randomUUID } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import type { JsonValue } from '../database/database.types';
import { DatabaseService } from '../database/database.service';
import { LocalIdentityContext } from '../identity/local-identity.context';
import { LlmGateway } from '../ai/llm-gateway';
import { buildComposeMessages, parseAgentReply } from './compose/compose-agent';
import type {
  ComposeHistoryItem,
  ComposeProposal,
  ComposeProposalKind,
} from './compose/compose-agent';
import { toComposeSnapshot } from './compose/compose-projection';
import type { ComposeMessageRow } from './compose/compose-projection';
import type { ComposeSnapshotView, TutorialMessageView } from './conversation.dto';
import { tutorialError } from './tutorial.service';
import { TutorialService } from './tutorial.service';
import { withTutorialTables, type TutorialDatabaseSchema } from './tutorial-db.types';

/** 用于持有对话会话切片的数据库、身份、模型与教程状态依赖。 */
@Injectable()
export class TutorialConversationsService {
  /** 用于注入数据库客户端、本地身份边界、LLM 网关与教程应用服务。 */
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly identity: LocalIdentityContext,
    private readonly llmGateway: LlmGateway,
    private readonly tutorialService: TutorialService,
  ) {}

  /** 用于返回 compose 会话快照（教程详情投影加对话消息与闸门卡）。 */
  async composeSnapshot(sessionId: string): Promise<ComposeSnapshotView> {
    const ownerId = this.identity.getActor().ownerId;
    await this.requireSession(ownerId, sessionId);
    const conversationId = await this.ensureConversation(sessionId);
    const conversation = await this.requireConversation(sessionId, conversationId);
    const [detail, rows] = await Promise.all([
      this.tutorialService.detail(sessionId),
      this.readMessageRows(conversationId),
    ]);
    return toComposeSnapshot({
      conversationCreatedAt: conversation.created_at.toISOString(),
      detail,
      knowledgeBase: detail.knowledgeBase,
      messages: rows,
    });
  }

  /** 用于先生成 Agent 回复，再在同一事务内落库用户与 Agent 消息，LLM 失败时全部不落库。 */
  async sendMessage(sessionId: string, content: string): Promise<TutorialMessageView[]> {
    const ownerId = this.identity.getActor().ownerId;
    await this.requireSession(ownerId, sessionId);
    const conversationId = await this.ensureConversation(sessionId);
    const conversation = await this.requireConversation(sessionId, conversationId);
    if (conversation.status !== 'active') {
      throw tutorialError('TUTORIAL_CONVERSATION_INACTIVE', '对话会话已归档，不能继续发送。', 409);
    }
    const reply = await this.generateReply(sessionId, conversationId, content);
    return this.databaseService.client.transaction().execute(async (tx) => {
      const database = withTutorialTables(tx);
      const userMessage = await this.insertMessage(database, conversationId, {
        content,
        proposal: null,
        role: 'user',
      });
      const agentMessage = await this.insertMessage(database, conversationId, {
        content: reply.reply,
        proposal: reply.proposal,
        role: 'agent',
      });
      return [userMessage, agentMessage];
    });
  }

  /** 用于调用 LLM 生成结构化回复，解析失败时降级为纯文本回复。 */
  private async generateReply(
    sessionId: string,
    conversationId: string,
    content: string,
  ): Promise<ComposeProposalReply> {
    const [history, state] = await Promise.all([
      this.readHistory(conversationId),
      this.readState(sessionId),
    ]);
    const text = await this.llmGateway
      .requireProvider()
      .complete(buildComposeMessages(state, history, content));
    return parseAgentReply(text);
  }

  /** 用于读取最近对话历史作为提示词上下文。 */
  private async readHistory(conversationId: string): Promise<ComposeHistoryItem[]> {
    const rows = await withTutorialTables(this.databaseService.client)
      .selectFrom('tutorial_messages')
      .select(['content', 'proposal', 'role'])
      .where('conversation_id', '=', conversationId)
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .limit(50)
      .execute();
    return rows.map((row) => {
      const kind = row.role === 'agent' ? readProposalKind(row.proposal) : null;
      return {
        content: row.content,
        ...(kind !== null ? { kind } : {}),
        role: row.role === 'agent' ? ('agent' as const) : ('user' as const),
      };
    });
  }

  /** 用于投影教程当前状态为提示词摘要。 */
  private async readState(sessionId: string) {
    const detail = await this.tutorialService.detail(sessionId);
    return {
      chapters: detail.chapters.map((chapter) => ({
        nodeKey: chapter.nodeKey,
        status: chapter.status,
        title: chapter.title,
      })),
      outlineChapters: (detail.outline?.chapters ?? []).map((chapter) => ({
        nodeKey: chapter.nodeKey,
        summary: chapter.summary ?? '',
        title: chapter.title,
      })),
      scope: `主题「${detail.scope.topic}」，受众「${detail.scope.audience}」，水平 ${detail.scope.level}/100，深度 ${detail.scope.depth}`,
      status: detail.status,
    };
  }

  /** 用于在给定连接上插入一条对话消息并返回公开视图。 */
  private async insertMessage(
    database: Kysely<TutorialDatabaseSchema>,
    conversationId: string,
    message: { content: string; proposal: ComposeProposal | null; role: 'agent' | 'user' },
  ): Promise<TutorialMessageView> {
    const { content, proposal, role } = message;
    const row = await database
      .insertInto('tutorial_messages')
      .values({
        content: content.slice(0, 20000),
        conversation_id: conversationId,
        ...(proposal === null
          ? {}
          : { proposal: JSON.stringify(proposal) as unknown as JsonValue }),
        proposal_status: proposal === null ? null : 'pending',
        id: randomUUID(),
        role,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toMessageView(row);
  }

  /** 用于读取对话全部消息行（快照与详情共用）。 */
  private async readMessageRows(conversationId: string): Promise<ComposeMessageRow[]> {
    return withTutorialTables(this.databaseService.client)
      .selectFrom('tutorial_messages')
      .selectAll()
      .where('conversation_id', '=', conversationId)
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .execute();
  }

  /** 用于按所有者断言教程会话存在。 */
  private async requireSession(ownerId: string, sessionId: string) {
    const session = await withTutorialTables(this.databaseService.client)
      .selectFrom('tutorial_sessions')
      .select(['id', 'topic'])
      .where('id', '=', sessionId)
      .where('owner_id', '=', ownerId)
      .executeTakeFirst();
    if (session === undefined) throw new NotFoundException();
    return session;
  }

  /** 用于在事务锁内创建或复用当前教程的 active 对话会话。 */
  private async ensureConversation(sessionId: string): Promise<string> {
    const ownerId = this.identity.getActor().ownerId;
    return this.databaseService.client.transaction().execute(async (tx) => {
      const locked = withTutorialTables(tx);
      const { sql } = await import('kysely');
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`tutorial-conversation:${sessionId}`}, 0))`.execute(
        locked,
      );
      const existing = await locked
        .selectFrom('tutorial_conversations')
        .select(['id'])
        .where('session_id', '=', sessionId)
        .where('status', '=', 'active')
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirst();
      if (existing !== undefined) return existing.id;
      const session = await locked
        .selectFrom('tutorial_sessions')
        .select(['topic'])
        .where('id', '=', sessionId)
        .where('owner_id', '=', ownerId)
        .executeTakeFirstOrThrow();
      const created = await locked
        .insertInto('tutorial_conversations')
        .values({
          id: randomUUID(),
          session_id: sessionId,
          status: 'active',
          title: session.topic.slice(0, 200),
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return created.id;
    });
  }

  /** 用于断言对话会话归属指定教程会话。 */
  private async requireConversation(sessionId: string, conversationId: string) {
    const conversation = await withTutorialTables(this.databaseService.client)
      .selectFrom('tutorial_conversations')
      .selectAll()
      .where('id', '=', conversationId)
      .where('session_id', '=', sessionId)
      .executeTakeFirst();
    if (conversation === undefined) throw new NotFoundException();
    return conversation;
  }
}

/** 解析后的 Agent 回复形态。 */
interface ComposeProposalReply {
  proposal: ComposeProposal | null;
  reply: string;
}

/** 用于从消息行 proposal JSON 读取合法提案类型，缺失时返回 null。 */
function readProposalKind(value: unknown): ComposeProposalKind | null {
  if (typeof value !== 'object' || value === null) return null;
  const kind = (value as { kind?: unknown }).kind;
  return kind === 'scope' || kind === 'outline' || kind === 'chapter' ? kind : null;
}

/** 用于把消息行投影为公开视图。 */
function toMessageView(row: {
  content: string;
  created_at: Date;
  id: string;
  proposal: unknown;
  proposal_status: string | null;
  role: string;
}): TutorialMessageView {
  return {
    content: row.content,
    createdAt: row.created_at.toISOString(),
    id: row.id,
    proposal: readProposalKind(row.proposal) ? (row.proposal as ComposeProposal) : null,
    proposalStatus: row.proposal_status,
    role: row.role as TutorialMessageView['role'],
  };
}
