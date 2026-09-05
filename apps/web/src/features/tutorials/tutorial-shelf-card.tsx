/**
 * @fileoverview 渲染教程书架卡片：标题、进度、状态徽章与继续阅读定位。
 */

import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@everlearn/ui';
import { BookOpenIcon } from 'lucide-react';
import Link from 'next/link';

import { formatDateTime } from '../../shared/format-datetime';
import type { TutorialListItem } from './tutorials-contract';
import { TUTORIAL_STATUS_LABELS, tutorialBadgeVariant } from './tutorials-status';

/** 用于渲染单个教程的书架卡片，主链接进详情、次链接直接续读。 */
export function TutorialShelfCard({ item }: { item: TutorialListItem }) {
  return (
    <article className="group relative rounded-xl">
      <Card className="h-full gap-3 py-5 transition-colors group-hover:border-primary/40">
        <CardHeader className="px-5">
          <CardDescription className="text-caption">
            {describeProgress(item)} · 更新于 {formatDateTime(item.updatedAt || item.createdAt)}
          </CardDescription>
          <CardTitle className="flex items-center gap-2 font-medium text-title-small text-foreground">
            <BookOpenIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <Link
              className="line-clamp-1 text-foreground after:absolute after:inset-0 hover:underline"
              href={`/tutorials/${item.id}`}
            >
              {item.topic}
            </Link>
            {item.knowledgeBase?.kind === 'tutorial' && (
              <Badge aria-label="教程产出库" variant="secondary">
                教程
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-2 px-5">
          <Badge variant={tutorialBadgeVariant(item.status)}>
            {TUTORIAL_STATUS_LABELS[item.status] ?? item.status}
          </Badge>
          {item.continueTo ? (
            <Link
              className="relative z-10 text-sm text-primary underline-offset-4 hover:underline"
              href={`/knowledge/${item.continueTo.knowledgeBaseId}/documents/${item.continueTo.documentId}`}
            >
              继续阅读：{item.continueTo.chapterTitle}
            </Link>
          ) : (
            <span className="text-sm text-muted-foreground">暂无可读章节</span>
          )}
        </CardContent>
      </Card>
    </article>
  );
}

/** 用于描述书架卡片的章节进度元信息。 */
function describeProgress(item: TutorialListItem): string {
  if (item.progress === null || item.progress.total === 0) return '尚未生成章节';
  const { completed, failed, total } = item.progress;
  const suffix = failed > 0 ? `，${failed} 章失败` : '';
  return `进度 ${completed}/${total} 章${suffix}`;
}
