/**
 * @fileoverview 教程详情页壳层：读取状态、页头徽标、?view 解析与主体分发。
 */

'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { Alert, AlertDescription, AlertTitle, Badge, Button, Skeleton } from '@everlearn/ui';
import { BookOpenIcon, PencilLineIcon, TriangleAlertIcon } from 'lucide-react';

import { ListSkeleton } from '../../shared/list-skeleton';
import { LoadFailure } from '../../shared/load-failure';
import { PageShell } from '../../shared/page-shell';
import { describeTutorialErrorCode } from './tutorials-api';
import type { TutorialDetail } from './tutorials-contract';
import { TUTORIAL_STATUS_LABELS, tutorialBadgeVariant } from './tutorials-status';
import { TutorialDraftNotice, TutorialViews } from './tutorial-views';
import type { TutorialView } from './tutorial-views';
import { useTutorialDetail } from './use-tutorial-detail';

/** 用于渲染教程详情页并持有 ?view 视图状态。 */
export function TutorialDetailPage({ tutorialId }: { tutorialId: string }) {
  const { detail, load, loadError } = useTutorialDetail(tutorialId);
  const searchParams = useSearchParams();
  const router = useRouter();
  const raw = searchParams.get('view');
  const view: TutorialView = raw === 'list' || raw === 'graph' ? raw : 'tree';

  useEffect(
    /** 用于把非法 view 参数 replace 回默认树视图。 */
    function normalizeView(): void {
      if (raw !== null && raw !== view) {
        router.replace(`/tutorials/${tutorialId}?view=tree`);
      }
    },
    [raw, view, router, tutorialId],
  );

  /** 用于切换视图并只 replace 查询参数。 */
  const changeView = (next: TutorialView): void => {
    router.replace(`/tutorials/${tutorialId}?view=${next}`);
  };

  return (
    <PageShell
      actions={<HeaderActions detail={detail} />}
      lead={<StatusLine detail={detail} />}
      title={
        <h1 data-page-title tabIndex={-1}>
          {detail?.topic ?? <Skeleton className="h-8 w-64" />}
        </h1>
      }
    >
      {detail === undefined && loadError !== undefined && (
        <DetailLoadFailure failure={loadError} onRetry={() => void load()} />
      )}
      {detail === undefined && loadError === undefined && <ListSkeleton count={1} />}
      {detail !== undefined && (
        <DetailBody
          detail={detail}
          onReload={() => void load()}
          view={view}
          onViewChange={changeView}
        />
      )}
    </PageShell>
  );
}

/** 用于区分不可访问与可重试的详情读取失败。 */
function DetailLoadFailure(props: {
  failure: { code?: string; message: string };
  onRetry: () => void;
}) {
  if (props.failure.code === 'NOT_FOUND') {
    return (
      <Alert>
        <TriangleAlertIcon aria-hidden="true" />
        <AlertTitle>无法访问该教程</AlertTitle>
        <AlertDescription>
          教程不存在或不属于当前用户，
          <Link className="text-primary underline-offset-4 hover:underline" href="/tutorials">
            返回教程书架
          </Link>
          。
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <LoadFailure description={props.failure.message} onRetry={props.onRetry} title="无法读取教程" />
  );
}

/** 用于渲染页头状态行与教程产出库徽标。 */
function StatusLine({ detail }: { detail: TutorialDetail | undefined }) {
  if (detail === undefined) return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Badge variant={tutorialBadgeVariant(detail.status)}>
        {TUTORIAL_STATUS_LABELS[detail.status] ?? detail.status}
      </Badge>
      {detail.knowledgeBase?.kind === 'tutorial' && <Badge variant="outline">教程产出库</Badge>}
      {detail.stage && <span aria-live="polite">{describeStage(detail)}</span>}
    </span>
  );
}

/** 用于生成阶段的真实计数控件文案，不伪造百分比。 */
export function describeStage(detail: TutorialDetail): string {
  const stage = detail.stage;
  if (stage === null) return '';
  if (stage.phase === 'researching') {
    const sources = stage.sourcesGathered ?? 0;
    return `研究中，已获取来源 ${sources}`;
  }
  const completed =
    stage.completed ?? detail.chapters.filter((c) => c.status === 'completed').length;
  const total = stage.total ?? detail.chapters.length;
  return `章节生成中 ${completed}/${total}`;
}

/** 用于渲染页头动作：继续阅读与进入创作。 */
function HeaderActions({ detail }: { detail: TutorialDetail | undefined }) {
  if (detail === undefined) return null;
  return (
    <>
      {detail.continueTo && (
        <Button asChild variant="outline">
          <Link
            href={`/knowledge/${detail.continueTo.knowledgeBaseId}/documents/${detail.continueTo.documentId}`}
          >
            <BookOpenIcon aria-hidden="true" />
            继续阅读
          </Link>
        </Button>
      )}
      <Button asChild>
        <Link href={`/tutorials/${detail.id}/compose`}>
          <PencilLineIcon aria-hidden="true" />
          {detail.chapters.length > 0 ? '继续创作' : '进入创作'}
        </Link>
      </Button>
    </>
  );
}

/** 用于按建库与章节状态分发详情主体。 */
function DetailBody({
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
  if (detail.chapters.length === 0) {
    return (
      <div className="grid gap-4">
        <WarningsNotice warnings={detail.warnings} />
        {detail.status === 'failed' ? (
          <LoadFailure
            description={describeTutorialErrorCode(detail.errorCode ?? '')}
            title="教程生成失败"
          />
        ) : (
          <TutorialDraftNotice detail={detail} />
        )}
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <WarningsNotice warnings={detail.warnings} />
      <TutorialViews detail={detail} onReload={onReload} view={view} onViewChange={onViewChange} />
    </div>
  );
}

/** 用于渲染告警警示条。 */
function WarningsNotice({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) return null;
  return (
    <Alert>
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle>本教程有告警</AlertTitle>
      <AlertDescription>
        <ul className="m-0 list-disc pl-4">
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
