/**
 * @fileoverview 详情页主体：左栏章节树与主区树、列表、图三视图 Tabs。
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@everlearn/ui';
import { ListIcon, GitBranchIcon, NetworkIcon, TriangleAlertIcon } from 'lucide-react';

import { ChapterGraphView } from './chapter-graph';
import { ChapterRailTree, ChapterTreeView } from './chapter-tree';
import { ChapterTableView } from './chapter-table';
import { retryTutorialChapter } from './tutorials-api';
import type { TutorialDetail } from './tutorials-contract';

/** 三视图的合法取值。 */
export type TutorialView = 'graph' | 'list' | 'tree';

/** 用于在主区渲染三视图 Tabs，切换只 replace ?view=。 */
export function TutorialViews({
  detail,
  onReload,
  view,
  onViewChange,
}: {
  detail: TutorialDetail;
  onReload: () => void;
  view: TutorialView;
  onViewChange: (view: TutorialView) => void;
}) {
  const [actionError, setActionError] = useState<string | undefined>(undefined);

  /** 用于重试单章并在完成后重读详情。 */
  const retryChapter = async (chapterId: string): Promise<string | undefined> => {
    const result = await retryTutorialChapter(chapterId);
    if (!result.ok) return result.error.message;
    onReload();
    return undefined;
  };

  const knowledgeBaseId = detail.knowledgeBase?.id ?? null;

  return (
    <div className="grid gap-6 xl:grid-cols-[15rem_minmax(0,1fr)]">
      <ChapterAside detail={detail} knowledgeBaseId={knowledgeBaseId} />
      <div className="grid min-w-0 gap-3">
        <Tabs onValueChange={(value) => onViewChange(value as TutorialView)} value={view}>
          <ViewTabsTriggers />
          <ViewTabsContent
            detail={detail}
            knowledgeBaseId={knowledgeBaseId}
            onActionError={setActionError}
            onRetry={retryChapter}
            onViewList={() => onViewChange('list')}
          />
        </Tabs>
        {actionError && (
          <p className="m-0 text-sm text-destructive" role="alert">
            {actionError}
          </p>
        )}
        <IncompleteNotice detail={detail} />
      </div>
    </div>
  );
}

/** 用于渲染树、列表、图三个视图切换入口。 */
function ViewTabsTriggers() {
  return (
    <TabsList aria-label="章节视图">
      <TabsTrigger value="tree">
        <GitBranchIcon aria-hidden="true" />树
      </TabsTrigger>
      <TabsTrigger value="list">
        <ListIcon aria-hidden="true" />
        列表
      </TabsTrigger>
      <TabsTrigger value="graph">
        <NetworkIcon aria-hidden="true" />图
      </TabsTrigger>
    </TabsList>
  );
}

/** 用于渲染左栏章节导航树。 */
function ChapterAside({
  detail,
  knowledgeBaseId,
}: {
  detail: TutorialDetail;
  knowledgeBaseId: string | null;
}) {
  return (
    <aside aria-label="章节目录" className="hidden min-w-0 border-r border-border pr-4 xl:block">
      <ChapterRailTree
        chapters={detail.chapters}
        currentChapterId={detail.currentChapterId}
        knowledgeBaseId={knowledgeBaseId}
      />
    </aside>
  );
}

/** 用于渲染当前视图对应的投影内容。 */
function ViewTabsContent({
  detail,
  knowledgeBaseId,
  onActionError,
  onRetry,
  onViewList,
}: {
  detail: TutorialDetail;
  knowledgeBaseId: string | null;
  onActionError: (message: string) => void;
  onRetry: (chapterId: string) => Promise<string | undefined>;
  onViewList: () => void;
}) {
  const actions = { onActionError, onRetry };
  return (
    <>
      <TabsContent value="tree">
        <ChapterTreeView
          chapters={detail.chapters}
          currentChapterId={detail.currentChapterId}
          knowledgeBaseId={knowledgeBaseId}
          {...actions}
        />
      </TabsContent>
      <TabsContent value="list">
        <ChapterTableView
          chapters={detail.chapters}
          knowledgeBaseId={knowledgeBaseId}
          {...actions}
        />
      </TabsContent>
      <TabsContent value="graph">
        <ChapterGraphView
          chapters={detail.chapters}
          currentChapterId={detail.currentChapterId}
          knowledgeBaseId={knowledgeBaseId}
          onViewList={onViewList}
        />
      </TabsContent>
    </>
  );
}

/** 用于在生成未完成时提示失败章节不阻塞无依赖章节。 */
function IncompleteNotice({ detail }: { detail: TutorialDetail }) {
  if (detail.status !== 'generating' && detail.status !== 'partial') return null;
  const failed = detail.chapters.filter(
    (chapter) => chapter.status === 'failed' || chapter.status === 'cancelled',
  );
  return (
    <Alert>
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle>
        {failed.length > 0 ? `${failed.length} 章未完成，可单章重试` : '章节仍在生成'}
      </AlertTitle>
      <AlertDescription>
        无依赖的章节会并行生成，完成即可读；失败章节不影响其他章节。
      </AlertDescription>
    </Alert>
  );
}

/** 用于渲染未建库阶段的引导视图，把创作交互收敛到 compose。 */
export function TutorialDraftNotice({ detail }: { detail: TutorialDetail }) {
  return (
    <Alert>
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle>{describeDraftStage(detail.status)}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-2">
        <span>研究与大纲确认都在创作对话中完成。</span>
        <Button asChild size="sm" variant="outline">
          <Link href={`/tutorials/${detail.id}/compose`}>进入创作</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** 用于描述未建库各阶段的用户可读状态。 */
function describeDraftStage(status: string): string {
  if (status === 'researching') return '正在按确认的范围研究主题';
  if (status === 'awaiting_outline') return '研究完成，等待在对话中确认大纲';
  return '教程还没有确认研究范围';
}
