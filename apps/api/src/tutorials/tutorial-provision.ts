/**
 * @fileoverview 在确认大纲事务内原子创建教程知识库、章节行与占位文档。
 */

import { randomUUID } from 'node:crypto';

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import type { JsonValue } from '../database/database.types';
import type { TutorialDatabaseSchema } from './tutorial-db.types';
import type { TutorialOutline, TutorialOutlineChapter } from './tutorial.dto';

/** 建库事务的上下文参数集合。 */
export interface ProvisionContext {
  readonly kbId: string;
  readonly ownerId: string;
  readonly sessionId: string;
  readonly tx: Kysely<TutorialDatabaseSchema>;
}

/** 用于在事务内创建教程知识库并返回标识。 */
export async function createTutorialKnowledgeBase(
  tx: Kysely<TutorialDatabaseSchema>,
  ownerId: string,
  topic: string,
): Promise<string> {
  const id = randomUUID();
  await tx
    .insertInto('knowledge_bases')
    .values({ id, kind: 'tutorial', name: `教程：${topic}`.slice(0, 120), owner_id: ownerId })
    .executeTakeFirstOrThrow();
  return id;
}

/** 用于为每章原子创建占位文档、章节行与初始修订。 */
export async function createChapterPlaceholders(
  context: ProvisionContext,
  outline: TutorialOutline,
): Promise<void> {
  for (const [index, chapter] of outline.chapters.entries()) {
    // 显式递增时间戳保证章节详情按大纲顺序稳定返回。
    const createdAt = new Date(Date.now() + index);
    const contentJson = summaryParagraph(chapter.summary ?? '');
    const documentId = await insertPlaceholderDocument(context, chapter, index, createdAt);
    await insertChapterRow(context, chapter, documentId, createdAt);
    await insertInitialRevision({
      context,
      createdAt,
      contentJson,
      documentId,
      title: chapter.title,
    });
  }
}

/** 用于插入章节行并绑定占位文档。 */
async function insertChapterRow(
  context: ProvisionContext,
  chapter: TutorialOutlineChapter,
  documentId: string,
  createdAt: Date,
): Promise<void> {
  await context.tx
    .insertInto('tutorial_chapters')
    .values({
      created_at: createdAt,
      depends_on: [...(chapter.dependsOn ?? [])],
      document_id: documentId,
      id: randomUUID(),
      node_key: chapter.nodeKey,
      session_id: context.sessionId,
      status: 'pending',
      title: chapter.title,
    })
    .executeTakeFirstOrThrow();
}

/** 用于插入占位文档并返回文档标识。 */
async function insertPlaceholderDocument(
  context: ProvisionContext,
  chapter: TutorialOutlineChapter,
  index: number,
  createdAt: Date,
): Promise<string> {
  const documentId = randomUUID();
  const summary = chapter.summary ?? '';
  await context.tx
    .insertInto('documents')
    .values({
      content_json: summaryParagraph(summary),
      created_at: createdAt,
      id: documentId,
      knowledge_base_id: context.kbId,
      owner_id: context.ownerId,
      path: `/${documentId}`,
      position: index,
      plain_text: summary,
      title: chapter.title,
    })
    .executeTakeFirstOrThrow();
  return documentId;
}

/** 初始修订的写入参数集合。 */
interface RevisionInput {
  readonly contentJson: JsonValue;
  readonly createdAt: Date;
  readonly context: ProvisionContext;
  readonly documentId: string;
  readonly title: string;
}

/** 用于插入占位文档的初始修订。 */
async function insertInitialRevision(input: RevisionInput): Promise<void> {
  const { context } = input;
  await context.tx
    .insertInto('document_revisions')
    .values({
      content_json: input.contentJson,
      created_at: input.createdAt,
      created_by: context.ownerId,
      document_id: input.documentId,
      id: randomUUID(),
      owner_id: context.ownerId,
      plain_text: '',
      revision_number: 1,
      schema_version: 1,
      source: 'automation',
      title: input.title,
    })
    .executeTakeFirstOrThrow();
}

/** 用于构造摘要段落的占位正文。 */
function summaryParagraph(summary: string): JsonValue {
  return {
    blocks: [
      {
        blockId: randomUUID(),
        content: [{ text: summary, type: 'text' }],
        type: 'paragraph',
      },
    ],
    type: 'doc',
  };
}
