/**
 * @fileoverview 章节列表视图：平铺全部章节信息，是图视图的无障碍等价入口。
 */

'use client';

import { Badge, Button } from '@everlearn/ui';
import { RotateCcwIcon } from 'lucide-react';
import Link from 'next/link';

import { chapterDocumentHref, dependencyTitles } from './chapter-projections';
import { describeChapterErrorCode } from './tutorials-api';
import type { TutorialChapter } from './tutorials-contract';
import {
  CHAPTER_STATUS_LABELS,
  chapterBadgeVariant,
  isReadableChapter,
  isRetryableChapter,
} from './tutorials-status';
import type { TreeViewActions } from './chapter-tree';

/** 用于渲染平铺章节表，可独立完成全部章节与依赖信息读取。 */
export function ChapterTableView({
  chapters,
  knowledgeBaseId,
  onActionError,
  onRetry,
}: {
  readonly chapters: readonly TutorialChapter[];
  readonly knowledgeBaseId: string | null;
} & TreeViewActions) {
  const titlesOf = dependencyTitles(chapters);
  return (
    <table aria-label="章节列表" className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          <th className="py-2 pr-3 font-medium">章节</th>
          <th className="py-2 pr-3 font-medium">状态</th>
          <th className="py-2 pr-3 font-medium">依赖</th>
          <th className="py-2 pr-3 font-medium">操作</th>
        </tr>
      </thead>
      <tbody>
        {chapters.map((chapter) => (
          <ChapterTableRow
            chapter={chapter}
            dependencies={titlesOf(chapter)}
            href={chapterDocumentHref(chapter, knowledgeBaseId)}
            key={chapter.id}
            onActionError={onActionError}
            onRetry={onRetry}
          />
        ))}
      </tbody>
    </table>
  );
}

/** 用于渲染列表行内的状态徽章与失败原因。 */
function StatusCell({ chapter }: { chapter: TutorialChapter }) {
  return (
    <>
      <Badge variant={chapterBadgeVariant(chapter.status)}>
        {CHAPTER_STATUS_LABELS[chapter.status] ?? chapter.status}
      </Badge>
      {isRetryableChapter(chapter.status) && chapter.errorCode !== null && (
        <span className="mt-1 block text-xs text-destructive">
          {describeChapterErrorCode(chapter.errorCode)}
        </span>
      )}
    </>
  );
}

/** 用于渲染列表行内的阅读或重试操作。 */
function ActionCell(props: {
  chapter: TutorialChapter;
  href: string | null;
  onActionError: (message: string) => void;
  onRetry: (chapterId: string) => Promise<string | undefined>;
}) {
  const { chapter, href, onActionError, onRetry } = props;
  if (isReadableChapter(chapter.status) && href) {
    return (
      <Link className="text-primary underline-offset-4 hover:underline" href={href}>
        阅读本章
      </Link>
    );
  }
  if (isRetryableChapter(chapter.status)) {
    return (
      <Button
        aria-label={`重试章节 ${chapter.title}`}
        onClick={() =>
          void onRetry(chapter.id).then((error) => {
            if (error !== undefined) onActionError(error);
          })
        }
        size="xs"
        type="button"
        variant="outline"
      >
        <RotateCcwIcon aria-hidden="true" />
        重试本章
      </Button>
    );
  }
  return <span className="text-muted-foreground">—</span>;
}

/** 用于渲染列表视图单章的一行完整信息。 */
function ChapterTableRow({
  chapter,
  dependencies,
  href,
  onActionError,
  onRetry,
}: {
  chapter: TutorialChapter;
  dependencies: readonly string[];
  href: string | null;
  onActionError: (message: string) => void;
  onRetry: (chapterId: string) => Promise<string | undefined>;
}) {
  return (
    <tr className="border-b border-border align-top">
      <td className="max-w-64 py-2 pr-3">
        <span className="block font-medium text-foreground">{chapter.title}</span>
        {chapter.summary && (
          <span className="block text-xs text-muted-foreground">{chapter.summary}</span>
        )}
      </td>
      <td className="py-2 pr-3">
        <StatusCell chapter={chapter} />
      </td>
      <td className="py-2 pr-3 text-muted-foreground">
        {dependencies.length > 0 ? dependencies.join('、') : '无'}
      </td>
      <td className="py-2 pr-3">
        <ActionCell chapter={chapter} href={href} onActionError={onActionError} onRetry={onRetry} />
      </td>
    </tr>
  );
}
