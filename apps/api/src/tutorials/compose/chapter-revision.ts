/**
 * @fileoverview 实现章节内容提案的占位授权检测与修订写入。
 */

import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' };

import { writeChapterRevision } from '../tutorial-runs.helpers';
import { tutorialError } from '../tutorial.service';
import type { TutorialDatabaseSchema } from '../tutorial-db.types';

/** 章节提案写入所需的最小章节行信息。 */
export interface ChapterRevisionTarget {
  readonly documentId: string;
  readonly title: string;
}

/** 用于判断章节文档在最近一次自动化写入之后是否出现用户编辑。 */
export function hasManualEdits(
  documentPlainText: string,
  revisions: readonly { plain_text: string; revision_number: number; source: string }[],
): boolean {
  const automationNumbers = revisions
    .filter((revision) => revision.source === 'automation')
    .map((revision) => revision.revision_number);
  const lastAutomation = automationNumbers.length > 0 ? Math.max(...automationNumbers) : null;
  if (lastAutomation === null) return revisions.length > 0;
  const laterRevision = revisions.find(
    (revision) => revision.revision_number > lastAutomation && revision.source !== 'automation',
  );
  if (laterRevision !== undefined) return true;
  const lastAutomationRevision = revisions.find(
    (revision) => revision.revision_number === lastAutomation,
  );
  return documentPlainText !== (lastAutomationRevision?.plain_text ?? '');
}

/** 用于在占位授权通过后把提案正文写入章节文档新修订，返回修订号。 */
export function writeAcceptedChapterRevision(
  tx: Kysely<TutorialDatabaseSchema>,
  target: ChapterRevisionTarget,
  markdown: string,
): Promise<number> {
  return writeChapterRevision(tx, {
    documentId: target.documentId,
    markdown,
    source: 'automation',
    title: target.title,
  });
}

/** 用于写入用户在差异确认中提交的内容并返回修订号。 */
export function writeConfirmedChapterDiff(
  tx: Kysely<TutorialDatabaseSchema>,
  target: ChapterRevisionTarget,
  content: string,
): Promise<number> {
  return writeChapterRevision(tx, {
    documentId: target.documentId,
    markdown: content,
    source: 'manual',
    title: target.title,
  });
}

/** 用于在文档行锁内检测用户编辑并在冲突时抛出需要差异确认的错误。 */
export async function requireNoManualEdits(
  tx: Kysely<TutorialDatabaseSchema>,
  documentId: string,
): Promise<ChapterRevisionTarget> {
  const document = await tx
    .selectFrom('documents')
    .select(['plain_text', 'title'])
    .where('id', '=', documentId)
    .where('deleted_at', 'is', null)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const revisions = await tx
    .selectFrom('document_revisions')
    .select(['plain_text', 'revision_number', 'source'])
    .where('document_id', '=', documentId)
    .orderBy('revision_number', 'asc')
    .execute();
  if (hasManualEdits(document.plain_text, revisions)) {
    throw tutorialError(
      'TUTORIAL_CHAPTER_USER_EDITED',
      '章节存在手工修订，需先通过差异确认才能覆盖。',
      409,
    );
  }
  return { documentId, title: document.title };
}
