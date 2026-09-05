/**
 * @fileoverview compose 创作页：左对话流右实时预览，移动端仅保留阅读说明。
 */

'use client';

import Link from 'next/link';

import { Alert, AlertDescription, AlertTitle, Button, Skeleton } from '@everlearn/ui';
import { ArrowLeftIcon, TriangleAlertIcon } from 'lucide-react';

import { LoadFailure } from '../../../shared/load-failure';
import { PageShell } from '../../../shared/page-shell';
import { useOnline } from '../../../shared/use-online';
import type { ComposeSnapshot } from '../tutorials-contract';
import { ComposePreview } from './compose-preview';
import { ComposeThread } from './compose-thread';
import { useComposeSession } from './use-compose-session';
import type { CardDecision } from './use-compose-session';
import type { ComposeCard } from '../tutorials-contract';

/** 用于渲染 compose 创作页并协调会话状态与布局。 */
export function ComposePage({ tutorialId }: { tutorialId: string }) {
  const online = useOnline();
  const { decide, load, loadError, send, sending, snapshot } = useComposeSession(tutorialId);

  return (
    <PageShell
      actions={
        <Button asChild variant="outline">
          <Link href={`/tutorials/${tutorialId}`}>
            <ArrowLeftIcon aria-hidden="true" />
            退出创作，回阅读
          </Link>
        </Button>
      }
      lead={snapshot ? '与 Agent 对话完成范围确认、大纲与章节生成。' : undefined}
      title={
        <h1 data-page-title tabIndex={-1}>
          {snapshot?.topic ?? <Skeleton className="h-8 w-64" />}
        </h1>
      }
    >
      {!online && <OfflineNotice />}
      {snapshot === undefined && loadError !== undefined && (
        <LoadFailure
          description={loadError.message}
          onRetry={() => void load()}
          title="无法读取创作会话"
        />
      )}
      {snapshot === undefined && loadError === undefined && <ComposeSkeleton />}
      {snapshot !== undefined && (
        <ComposeBody
          decide={decide}
          send={send}
          sending={sending}
          snapshot={snapshot}
          tutorialId={tutorialId}
        />
      )}
    </PageShell>
  );
}

/** 用于渲染离线时的能力降级说明。 */
function OfflineNotice() {
  return (
    <Alert className="mb-4">
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle>当前离线</AlertTitle>
      <AlertDescription>
        已生成章节与历史消息可读；发送、确认与重试在恢复网络后可用。
      </AlertDescription>
    </Alert>
  );
}

/** 用于渲染移动端创作路由的阅读说明。 */
function MobileComposeNotice({ tutorialId }: { tutorialId: string }) {
  return (
    <Alert>
      <TriangleAlertIcon aria-hidden="true" />
      <AlertTitle>移动端暂不提供创作</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-2">
        <span>创作对话、确认与差异接受请在桌面端完成，运行状态与章节进度随时可读。</span>
        <Button asChild size="sm" variant="outline">
          <Link href={`/tutorials/${tutorialId}`}>返回阅读</Link>
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** 用于在桌面渲染对话与预览双栏，移动端只留说明。 */
function ComposeBody(props: {
  decide: (card: ComposeCard, decision: CardDecision) => Promise<string | undefined>;
  send: (content: string, idempotencyKey: string) => Promise<string | undefined>;
  sending: boolean;
  snapshot: ComposeSnapshot;
  tutorialId: string;
}) {
  const { decide, send, sending, snapshot, tutorialId } = props;
  const generating = snapshot.stage?.phase === 'generating' || snapshot.status === 'generating';
  return (
    <>
      <div className="md:hidden">
        <MobileComposeNotice tutorialId={tutorialId} />
      </div>
      <div className="hidden gap-6 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <section aria-label="创作对话流" className="grid min-w-0 content-start gap-3">
          <ComposeThread
            disabled={sending || generating}
            onDecide={decide}
            onSend={send}
            snapshot={snapshot}
          />
        </section>
        <section aria-label="教程预览" className="min-w-0 rounded-lg border border-border p-4">
          <ComposePreview snapshot={snapshot} />
        </section>
      </div>
    </>
  );
}

/** 用于渲染会话首读期间保持布局的骨架。 */
function ComposeSkeleton() {
  return (
    <div
      aria-label="正在加载创作会话"
      className="hidden gap-6 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"
      role="status"
    >
      <div className="grid gap-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-24" />
        <Skeleton className="h-10" />
      </div>
      <div className="grid gap-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}
