/**
 * @fileoverview 章节树投影：左栏脊线导航树与主区大纲层级树视图。
 */

'use client';

import { Badge, Button } from '@everlearn/ui';
import { RotateCcwIcon } from 'lucide-react';
import Link from 'next/link';

import { chapterDocumentHref, dependencyTitles, treeRows } from './chapter-projections';
import { describeChapterErrorCode } from './tutorials-api';
import type { TutorialChapter } from './tutorials-contract';
import { CHAPTER_STATUS_LABELS, chapterBadgeVariant, isRetryableChapter } from './tutorials-status';

/** 树投影的共享输入。 */
interface ChapterTreeProps {
  readonly chapters: readonly TutorialChapter[];
  readonly currentChapterId: string | null;
  readonly knowledgeBaseId: string | null;
}

/** 用于渲染左栏章节导航树，脊线标记当前章节位置。 */
export function ChapterRailTree({ chapters, currentChapterId, knowledgeBaseId }: ChapterTreeProps) {
  const rows = treeRows(chapters);
  return (
    <nav aria-label="章节目录">
      <ul className="m-0 grid list-none gap-0.5 p-0">
        {rows.map(({ chapter, depth }) => (
          <RailRow
            chapter={chapter}
            current={chapter.id === currentChapterId}
            href={chapterDocumentHref(chapter, knowledgeBaseId)}
            key={chapter.id}
            style={{ marginLeft: `${depth * 0.75}rem` }}
          />
        ))}
      </ul>
    </nav>
  );
}

/** 用于渲染一行左栏章节导航，完成章节可进文档，其余保持只读。 */
function RailRow({
  chapter,
  current,
  href,
  style,
}: {
  chapter: TutorialChapter;
  current: boolean;
  href: string | null;
  style: React.CSSProperties;
}) {
  const className =
    'relative flex min-w-0 items-center gap-1.5 rounded-md py-1 pr-1 text-sm hover:bg-accent';
  const label = (
    <>
      <StatusDot status={chapter.status} />
      <span className="min-w-0 flex-1 truncate text-foreground" title={chapter.title}>
        {chapter.title}
      </span>
    </>
  );
  return (
    <li>
      {href ? (
        <Link
          aria-current={current ? 'page' : undefined}
          className={`${className} ${current ? 'bg-accent font-medium' : ''}`}
          href={href}
          style={style}
        >
          {label}
        </Link>
      ) : (
        <span
          aria-current={current ? 'true' : undefined}
          className={`${className} ${current ? 'bg-accent font-medium' : ''} text-muted-foreground`}
          style={style}
        >
          {label}
        </span>
      )}
      {current && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0.5 left-0 w-0.5 rounded-full bg-primary"
        />
      )}
    </li>
  );
}

/** 用于渲染章节状态的小圆点，颜色之外保留形状与文字通道。 */
function StatusDot({ status }: { status: string }) {
  if (status === 'failed' || status === 'cancelled')
    return <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-destructive" />;
  if (status === 'completed' || status === 'warning')
    return <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-primary" />;
  return (
    <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
  );
}

/** 主区树视图的操作回调。 */
export interface TreeViewActions {
  readonly onActionError: (message: string) => void;
  readonly onRetry: (chapterId: string) => Promise<string | undefined>;
}

/** 用于渲染主区默认树视图：大纲层级展开、状态徽章与依赖脊线。 */
export function ChapterTreeView({
  chapters,
  currentChapterId,
  knowledgeBaseId,
  onActionError,
  onRetry,
}: ChapterTreeProps & TreeViewActions) {
  const rows = treeRows(chapters);
  const titlesOf = dependencyTitles(chapters);
  return (
    <ol aria-label="章节大纲树" className="m-0 grid list-none gap-2 p-0">
      {rows.map(({ chapter, depth }) => (
        <li
          className="relative rounded-md border border-border px-3 py-2"
          key={chapter.id}
          style={{ marginLeft: `${depth * 1.25}rem` }}
        >
          {chapter.id === currentChapterId && (
            <span
              aria-hidden="true"
              className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
            />
          )}
          <TreeRow
            chapter={chapter}
            dependencies={titlesOf(chapter)}
            href={chapterDocumentHref(chapter, knowledgeBaseId)}
            onActionError={onActionError}
            onRetry={onRetry}
          />
        </li>
      ))}
    </ol>
  );
}

/** 用于渲染单章的重试按钮并回传失败文案。 */
function RetryChapterButton({
  chapter,
  onActionError,
  onRetry,
}: {
  chapter: TutorialChapter;
  onActionError: (message: string) => void;
  onRetry: (chapterId: string) => Promise<string | undefined>;
}) {
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

/** 用于渲染树视图单章的标题、徽章、摘要、依赖与操作。 */
function TreeRow({
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
  const retryable = isRetryableChapter(chapter.status);
  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={chapterBadgeVariant(chapter.status)}>
          {CHAPTER_STATUS_LABELS[chapter.status] ?? chapter.status}
        </Badge>
        <span className="min-w-0 truncate font-medium text-foreground">{chapter.title}</span>
        {href && (
          <Link className="text-sm text-primary underline-offset-4 hover:underline" href={href}>
            阅读本章
          </Link>
        )}
        {retryable && (
          <RetryChapterButton chapter={chapter} onActionError={onActionError} onRetry={onRetry} />
        )}
      </div>
      {chapter.summary && <p className="m-0 text-sm text-muted-foreground">{chapter.summary}</p>}
      {dependencies.length > 0 && (
        <p className="m-0 text-xs text-muted-foreground">依赖：{dependencies.join('、')}</p>
      )}
      {retryable && chapter.errorCode !== null && (
        <p className="m-0 text-xs text-destructive">
          {describeChapterErrorCode(chapter.errorCode)}
        </p>
      )}
    </div>
  );
}
