/**
 * @fileoverview 提供教程运行服务的章节终态、修订写入与知识库文本读取辅助函数。
 */

import { randomUUID } from 'node:crypto';

import { NotFoundException } from '@nestjs/common';
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import type { JsonValue } from '../database/database.types';
import type { TutorialDatabaseSchema } from './tutorial-db.types';

/** 每个知识库参与研究的纯文本截断上限。 */
const KB_TEXT_LIMIT = 8000;

/** 用于读取相关会话全部章节的状态映射（键为 session:nodeKey）。 */
export async function readChapterStatusMap(
  tx: Kysely<TutorialDatabaseSchema>,
  sessionIds: readonly string[],
): Promise<Map<string, string>> {
  if (sessionIds.length === 0) return new Map();
  const rows = await tx
    .selectFrom('tutorial_chapters')
    .select(['node_key', 'session_id', 'status'])
    .where(
      'session_id',
      'in',
      sessionIds.filter((value, index, all) => all.indexOf(value) === index),
    )
    .execute();
  return new Map(rows.map((row) => [`${row.session_id}:${row.node_key}`, row.status]));
}

/** 用于在全部章节终态后把会话推进到 completed/partial。 */
export async function finalizeSession(
  sessionId: string,
  tx: Kysely<TutorialDatabaseSchema>,
): Promise<void> {
  const chapters = await tx
    .selectFrom('tutorial_chapters')
    .select('status')
    .where('session_id', '=', sessionId)
    .execute();
  if (chapters.some((row) => ['pending', 'generating'].includes(row.status))) return;
  await tx
    .updateTable('tutorial_sessions')
    .set({
      status: chapters.some((row) => row.status === 'failed') ? 'partial' : 'completed',
      updated_at: new Date(),
    })
    .where('id', '=', sessionId)
    .where('status', 'in', ['generating', 'partial'])
    .executeTakeFirstOrThrow();
}

/** 用于读取范围内知识库文档纯文本并按库截断。 */
export async function readKbScopeTexts(
  database: Kysely<TutorialDatabaseSchema>,
  kbScope: readonly string[],
): Promise<string[]> {
  if (kbScope.length === 0) return [];
  const rows = await database
    .selectFrom('documents')
    .select(['knowledge_base_id', 'plain_text'])
    .where('knowledge_base_id', 'in', [...kbScope])
    .where('deleted_at', 'is', null)
    .execute();
  return kbScope.map((kbId) =>
    rows
      .filter((row) => row.knowledge_base_id === kbId)
      .map((row) => row.plain_text)
      .join('\n\n')
      .slice(0, KB_TEXT_LIMIT),
  );
}

/** 用于从大纲 JSON 提取 nodeKey 到摘要的映射。 */
export function readOutlineSummaries(outline: unknown): Map<string, string> {
  const chapters =
    typeof outline === 'object' && outline !== null && 'chapters' in outline
      ? (outline.chapters as unknown[])
      : [];
  const summaries = new Map<string, string>();
  for (const chapter of chapters) {
    if (typeof chapter !== 'object' || chapter === null) continue;
    const record = chapter as Record<string, unknown>;
    if (typeof record.nodeKey === 'string') {
      summaries.set(record.nodeKey, typeof record.summary === 'string' ? record.summary : '');
    }
  }
  return summaries;
}

/** 用于把章节 Markdown 写入占位文档并追加一条 automation 修订。 */
export async function writeChapterRevision(
  tx: Kysely<TutorialDatabaseSchema>,
  documentId: string,
  title: string,
  markdown: string,
): Promise<void> {
  const document = await tx
    .selectFrom('documents')
    .select(['owner_id', 'version'])
    .where('id', '=', documentId)
    .where('deleted_at', 'is', null)
    .forUpdate()
    .executeTakeFirst();
  if (document === undefined) throw new NotFoundException();
  const contentJson = buildMarkdownContent(markdown);
  const latest = await tx
    .selectFrom('document_revisions')
    .select(({ fn }) => fn.max('revision_number').as('max'))
    .where('document_id', '=', documentId)
    .executeTakeFirstOrThrow();
  const revisionNumber = Number(latest.max ?? 0) + 1;
  await tx
    .insertInto('document_revisions')
    .values({
      content_json: contentJson,
      created_by: document.owner_id,
      document_id: documentId,
      id: randomUUID(),
      owner_id: document.owner_id,
      plain_text: markdown,
      revision_number: revisionNumber,
      schema_version: 1,
      source: 'automation',
      title,
    })
    .executeTakeFirstOrThrow();
  await tx
    .updateTable('documents')
    .set({
      content_json: contentJson,
      plain_text: markdown,
      updated_at: new Date(),
      version: document.version + 1,
    })
    .where('id', '=', documentId)
    .executeTakeFirstOrThrow();
}

/** 用于把 Markdown 按行降级为标题与段落块（不解析行内标记）。 */
function buildMarkdownContent(markdown: string): JsonValue {
  const blocks = markdown
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const heading = /^(#{1,4})\s+(.*)$/.exec(line);
      if (heading !== null) {
        return {
          attrs: { blockId: randomUUID(), level: heading[1]!.length },
          content: [{ text: heading[2]!, type: 'text' }],
          type: 'heading',
        };
      }
      return {
        attrs: { blockId: randomUUID() },
        content: [{ text: line, type: 'text' }],
        type: 'paragraph',
      };
    });
  return { content: blocks, type: 'doc' };
}
