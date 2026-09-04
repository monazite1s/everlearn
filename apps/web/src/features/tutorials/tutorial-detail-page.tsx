/**
 * @fileoverview 渲染教程详情页的壳层、状态分发与操作错误提示。
 */

'use client';

import { useState } from 'react';

import { Alert, AlertDescription, AlertTitle, Badge } from '@everlearn/ui';
import { AlertTriangleIcon } from 'lucide-react';

import { LoadFailure } from '../../shared/load-failure';
import { ListSkeleton } from '../../shared/list-skeleton';
import { PageShell } from '../../shared/page-shell';
import { OutlineEditor } from './outline-editor';
import { TutorialDraftPanel } from './tutorial-draft-panel';
import { TutorialGeneratingPanel } from './tutorial-generating-panel';
import {
  confirmTutorialOutline,
  describeTutorialErrorCode,
  updateTutorialOutline,
} from './tutorials-api';
import type { TutorialDetail, TutorialOutlineChapter } from './tutorials-api';
import { TUTORIAL_STATUS_LABELS, tutorialBadgeVariant } from './tutorials-status';
import { useTutorialDetail } from './use-tutorial-detail';

/** 用于渲染教程详情页。 */
export function TutorialDetailPage({ tutorialId }: { tutorialId: string }) {
  const { detail, load, loadError } = useTutorialDetail(tutorialId);
  const [actionError, setActionError] = useState<string | undefined>(undefined);
  const title = (
    <h1 data-page-title tabIndex={-1}>
      {detail?.scope?.topic ?? '教程'}
    </h1>
  );
  return (
    <PageShell lead={<StatusBadge detail={detail} />} title={title}>
      {detail === undefined && loadError !== undefined && (
        <LoadFailure
          description="请检查网络后重新读取教程详情。"
          onRetry={() => void load()}
          title="无法读取教程"
        />
      )}
      {detail === undefined && loadError === undefined && <ListSkeleton count={1} />}
      {detail !== undefined && (
        <>
          <WarningsNotice warnings={detail.warnings} />
          {actionError && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              {actionError}
            </p>
          )}
          <StatusBody detail={detail} onActionError={setActionError} onReload={() => void load()} />
        </>
      )}
    </PageShell>
  );
}

/** 用于渲染教程状态徽章。 */
function StatusBadge({ detail }: { detail: TutorialDetail | undefined }) {
  if (detail === undefined) return null;
  return (
    <span className="flex items-center gap-2">
      <Badge variant={tutorialBadgeVariant(detail.status)}>
        {TUTORIAL_STATUS_LABELS[detail.status] ?? detail.status}
      </Badge>
    </span>
  );
}

/** 用于渲染告警警示条。 */
function WarningsNotice({ warnings }: { warnings: readonly string[] }) {
  if (warnings.length === 0) return null;
  return (
    <Alert className="mb-4">
      <AlertTriangleIcon aria-hidden="true" />
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

/** 用于按教程状态分发主体视图。 */
function StatusBody({
  detail,
  onActionError,
  onReload,
}: {
  detail: TutorialDetail;
  onActionError: (message: string | undefined) => void;
  onReload: () => void;
}) {
  if (detail.status === 'draft') {
    return <TutorialDraftPanel detail={detail} onActionError={onActionError} onReload={onReload} />;
  }
  if (detail.status === 'researching') {
    return (
      <p className="text-sm text-muted-foreground">
        正在读取所选知识库并联网研究，完成后可确认大纲。页面会自动刷新，无需手动操作。
      </p>
    );
  }
  if (detail.status === 'outline_ready' && detail.outline !== null) {
    return (
      <OutlineEditor
        initialChapters={detail.outline.chapters}
        onActionError={onActionError}
        onConfirm={(chapters) => confirmOutline(detail.id, chapters, onReload)}
      />
    );
  }
  if (detail.status === 'failed') {
    return <FailedNotice detail={detail} />;
  }
  return (
    <TutorialGeneratingPanel detail={detail} onActionError={onActionError} onReload={onReload} />
  );
}

/** 用于渲染失败状态的错误文案与修改建议。 */
function FailedNotice({ detail }: { detail: TutorialDetail }) {
  const reason =
    detail.errorCode !== null
      ? describeTutorialErrorCode(detail.errorCode)
      : '教程生成失败，请稍后重试。';
  return (
    <p className="text-sm text-destructive" role="alert">
      {reason}建议调整主题或范围后重试。
    </p>
  );
}

/** 用于保存并确认大纲，失败时返回错误文案。 */
async function confirmOutline(
  tutorialId: string,
  chapters: TutorialOutlineChapter[],
  onReload: () => void,
): Promise<string | undefined> {
  const saved = await updateTutorialOutline(tutorialId, chapters);
  if (!saved.ok) return saved.error.message;
  const confirmed = await confirmTutorialOutline(tutorialId);
  if (!confirmed.ok) return confirmed.error.message;
  onReload();
  return undefined;
}
