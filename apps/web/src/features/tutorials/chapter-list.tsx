/**
 * @fileoverview 渲染教程章节列表、文档链接与失败章节重试。
 */

'use client';

import { Badge, Button } from '@everlearn/ui';
import { RotateCcwIcon } from 'lucide-react';

import { describeChapterErrorCode } from './tutorials-api';
import type { TutorialDetail } from './tutorials-api';
import { CHAPTER_STATUS_LABELS, chapterBadgeVariant } from './tutorials-status';

interface ChapterListProps {
  detail: TutorialDetail;
  onActionError: (message: string) => void;
  onRetry: (chapterId: string) => Promise<string | undefined>;
}

/** 用于渲染章节列表与逐章操作。 */
export function ChapterList({ detail, onActionError, onRetry }: ChapterListProps) {
  return (
    <section aria-labelledby="chapters-title" className="grid gap-2">
      <h2 className="m-0 text-title-small text-foreground" id="chapters-title">
        章节
      </h2>
      <ul className="m-0 grid list-none gap-2 p-0">
        {detail.chapters.map((chapter) => (
          <ChapterRow
            chapter={chapter}
            key={chapter.id}
            knowledgeBaseId={detail.tutorialKnowledgeBaseId}
            onActionError={onActionError}
            onRetry={onRetry}
          />
        ))}
      </ul>
    </section>
  );
}

/** 用于渲染单章状态、错误与操作。 */
function ChapterRow({
  chapter,
  knowledgeBaseId,
  onActionError,
  onRetry,
}: {
  chapter: TutorialDetail['chapters'][number];
  knowledgeBaseId: string | null;
  onActionError: (message: string) => void;
  onRetry: (chapterId: string) => Promise<string | undefined>;
}) {
  const retryable = chapter.status === 'failed' || chapter.status === 'canceled';
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
      <ChapterInfo chapter={chapter} retryable={retryable} />
      <span className="flex items-center gap-2">
        {chapter.status === 'succeeded' &&
          chapter.documentId !== null &&
          knowledgeBaseId !== null && (
            <a
              className="text-primary underline-offset-4 hover:underline"
              href={`/knowledge/${knowledgeBaseId}/documents/${chapter.documentId}`}
            >
              阅读本章
            </a>
          )}
        {retryable && (
          <Button
            aria-label={`重试章节 ${chapter.title}`}
            onClick={() =>
              void onRetry(chapter.id).then((error) => {
                if (error !== undefined) onActionError(error);
              })
            }
            size="sm"
            type="button"
            variant="outline"
          >
            <RotateCcwIcon aria-hidden="true" />
            重试
          </Button>
        )}
      </span>
    </li>
  );
}

/** 用于渲染章节的状态徽章、尝试次数与错误文案。 */
function ChapterInfo({
  chapter,
  retryable,
}: {
  chapter: TutorialDetail['chapters'][number];
  retryable: boolean;
}) {
  return (
    <span className="grid min-w-0 gap-0.5">
      <span className="flex items-center gap-2 font-medium text-foreground">
        <Badge variant={chapterBadgeVariant(chapter.status)}>
          {CHAPTER_STATUS_LABELS[chapter.status] ?? chapter.status}
        </Badge>
        <span className="truncate">{chapter.title}</span>
      </span>
      <span className="text-xs text-muted-foreground">已尝试 {chapter.attempt} 次</span>
      {retryable && chapter.errorCode !== null && (
        <span className="text-xs text-destructive" role="alert">
          {describeChapterErrorCode(chapter.errorCode)}
        </span>
      )}
    </span>
  );
}
