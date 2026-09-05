/**
 * @fileoverview compose 右栏教程实时预览：章节树、状态与阶段真实计数。
 */

'use client';

import { Badge } from '@everlearn/ui';

import { ChapterRailTree } from '../chapter-tree';
import type { ComposeSnapshot } from '../tutorials-contract';
import { TUTORIAL_STATUS_LABELS, tutorialBadgeVariant } from '../tutorials-status';

/** 用于渲染右侧预览：状态、阶段计数与随会话更新的章节树。 */
export function ComposePreview({ snapshot }: { snapshot: ComposeSnapshot }) {
  const knowledgeBaseId = snapshot.knowledgeBase?.id ?? null;
  return (
    <section aria-label="教程实时预览" className="grid content-start gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={tutorialBadgeVariant(snapshot.status)}>
          {TUTORIAL_STATUS_LABELS[snapshot.status] ?? snapshot.status}
        </Badge>
        {snapshot.stage && (
          <span aria-live="polite" className="text-sm text-muted-foreground">
            {describeStage(snapshot)}
          </span>
        )}
      </div>
      {snapshot.chapters.length > 0 ? (
        <ChapterRailTree
          chapters={snapshot.chapters}
          currentChapterId={null}
          knowledgeBaseId={knowledgeBaseId}
        />
      ) : (
        <PreviewPlaceholder snapshot={snapshot} />
      )}
    </section>
  );
}

/** 用于描述预览区异步阶段的真实计数，不伪造百分比。 */
function describeStage(snapshot: ComposeSnapshot): string {
  const stage = snapshot.stage;
  if (stage === null) return '';
  if (stage.phase === 'researching') return `研究中，已获取来源 ${stage.sourcesGathered ?? 0}`;
  const total = stage.total ?? snapshot.chapters.length;
  return `章节生成中 ${stage.completed ?? 0}/${total}`;
}

/** 用于渲染大纲未确认前的阶段占位说明。 */
function PreviewPlaceholder({ snapshot }: { snapshot: ComposeSnapshot }) {
  if (snapshot.stage?.phase === 'researching') {
    return (
      <p className="m-0 text-sm text-muted-foreground">
        正在研究主题，大纲将在研究完成后由 Agent 提出。
      </p>
    );
  }
  if (snapshot.status === 'awaiting_outline') {
    return (
      <p className="m-0 text-sm text-muted-foreground">
        研究完成，等待在对话中确认大纲后创建章节。
      </p>
    );
  }
  return (
    <p className="m-0 text-sm text-muted-foreground">
      教程还没有章节，先在对话中确认研究范围与大纲。
    </p>
  );
}
