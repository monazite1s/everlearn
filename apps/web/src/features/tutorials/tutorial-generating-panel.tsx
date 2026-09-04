/**
 * @fileoverview 渲染章节生成期间与完成后的章节视图和取消入口。
 */

'use client';

import { useState } from 'react';

import { Button } from '@everlearn/ui';

import { ChapterList } from './chapter-list';
import { cancelTutorial, retryTutorialChapter } from './tutorials-api';
import type { TutorialDetail } from './tutorials-api';

/** 用于渲染生成中、部分完成与完成状态的章节视图。 */
export function TutorialGeneratingPanel({
  detail,
  onActionError,
  onReload,
}: {
  detail: TutorialDetail;
  onActionError: (message: string | undefined) => void;
  onReload: () => void;
}) {
  const [pending, setPending] = useState(false);
  const canCancel = detail.status === 'generating' || detail.status === 'partial';

  /** 用于取消剩余章节生成。 */
  const handleCancel = async (): Promise<void> => {
    if (pending) return;
    setPending(true);
    const result = await cancelTutorial(detail.id);
    setPending(false);
    if (!result.ok) {
      onActionError(result.error.message);
      return;
    }
    onReload();
  };

  /** 用于重试单章并刷新详情。 */
  const handleRetry = async (chapterId: string): Promise<string | undefined> => {
    const result = await retryTutorialChapter(detail.id, chapterId);
    if (!result.ok) return result.error.message;
    onReload();
    return undefined;
  };

  return (
    <div className="grid gap-4">
      <ChapterList detail={detail} onActionError={onActionError} onRetry={handleRetry} />
      {canCancel && <CancelFooter disabled={pending} onCancel={() => void handleCancel()} />}
    </div>
  );
}

/** 用于渲染取消剩余章节按钮与副作用说明。 */
function CancelFooter({ disabled, onCancel }: { disabled: boolean; onCancel: () => void }) {
  return (
    <div className="grid gap-1">
      <Button
        className="w-fit"
        disabled={disabled}
        onClick={onCancel}
        type="button"
        variant="outline"
      >
        取消剩余章节
      </Button>
      <p className="m-0 text-xs text-muted-foreground">
        取消后未完成的章节将停止生成，已完成的章节保留，可逐章重试。
      </p>
    </div>
  );
}
