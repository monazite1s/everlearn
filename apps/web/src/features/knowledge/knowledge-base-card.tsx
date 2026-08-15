/** @fileoverview 渲染列表页面共享的知识库入口卡片。 */

import type { KnowledgeBaseSummary } from '@everlearn/contracts';
import { BookOpenIcon } from 'lucide-react';
import Link from 'next/link';

import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@everlearn/ui';

import { formatDateTime } from '../../shared/format-datetime';

/** 用于将真实知识库呈现为单一可访问导航目标。 */
export function KnowledgeBaseCard({ knowledgeBase }: { knowledgeBase: KnowledgeBaseSummary }) {
  return (
    <Link className="group/link h-full no-underline" href={`/knowledge/${knowledgeBase.id}`}>
      <Card className="h-full gap-3 py-5 transition-colors group-hover/link:border-primary/40">
        <CardHeader className="px-5">
          <CardDescription className="text-caption">
            {knowledgeBase.documentCount} 篇文档 · 更新于 {formatDateTime(knowledgeBase.updatedAt)}
          </CardDescription>
          <CardTitle className="flex items-center gap-2 font-medium text-title-small text-foreground">
            <span className="line-clamp-1">{knowledgeBase.name}</span>
            {knowledgeBase.kind !== 'normal' && <Badge variant="secondary">系统</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-start gap-2 px-5">
          <BookOpenIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-muted-foreground"
          />
          <p className="m-0 line-clamp-2 text-sm text-muted-foreground">
            {knowledgeBase.description || '还没有说明。'}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
