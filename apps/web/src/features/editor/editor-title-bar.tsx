/** @fileoverview 渲染编辑会话的面包屑、标题输入与右侧动作组。 */

'use client';

import Link from 'next/link';
import { PanelRightIcon } from 'lucide-react';

import { DOCUMENT_TITLE_MAX_LENGTH } from '@everlearn/contracts';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Button,
} from '@everlearn/ui';

import { SaveStatusBadge } from './save-status';
import type { SessionRuntime } from './document-session';

/** 用于渲染文档上下文面包屑：知识库名与当前文档标题。 */
function TitleBreadcrumb(props: {
  readonly kbName?: string | undefined;
  readonly knowledgeBaseId: string;
  readonly title: string;
}) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:inline-flex">
          <BreadcrumbLink asChild>
            <Link href={`/knowledge/${props.knowledgeBaseId}`}>{props.kbName ?? '知识库'}</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator className="hidden md:block" />
        <BreadcrumbItem>
          <BreadcrumbPage className="max-w-60 truncate">{props.title}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** 用于渲染标题右侧的保存状态与右栏开合动作组。 */
function TitleActions(props: {
  readonly onTogglePanel: () => void;
  readonly panelOpen: boolean;
  readonly runtime: SessionRuntime;
}) {
  const { runtime } = props;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <SaveStatusBadge
        onCopyLocal={() => void runtime.copyLocal()}
        onRetry={runtime.save.retry}
        status={runtime.save.status}
      />
      <Button
        aria-label={props.panelOpen ? '收起文档信息' : '打开文档信息'}
        aria-pressed={props.panelOpen}
        onClick={props.onTogglePanel}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        <PanelRightIcon aria-hidden="true" />
      </Button>
    </div>
  );
}

/** 用于渲染标题输入与保存状态、右栏开合动作组。 */
export function TitleBar(props: {
  readonly autoFocus?: boolean | undefined;
  /** 当前知识库显示名，未加载时回退通用名。 */
  readonly kbName?: string | undefined;
  readonly knowledgeBaseId: string;
  readonly onTogglePanel: () => void;
  readonly panelOpen: boolean;
  readonly runtime: SessionRuntime;
}) {
  const { runtime } = props;
  return (
    <>
      <div className="mx-auto w-full max-w-prose px-6 pt-3">
        <TitleBreadcrumb
          kbName={props.kbName}
          knowledgeBaseId={props.knowledgeBaseId}
          title={runtime.title || '无标题'}
        />
      </div>
      <div className="mx-auto flex min-h-14 w-full max-w-prose items-center gap-2 px-6 pt-2">
        <h1 className="m-0 min-w-0 flex-1" data-page-title tabIndex={-1}>
          <input
            aria-label="文档标题"
            autoFocus={props.autoFocus}
            className="w-full bg-transparent font-serif text-title-large text-foreground outline-none placeholder:text-muted-foreground"
            maxLength={DOCUMENT_TITLE_MAX_LENGTH}
            onChange={(event) => runtime.commitTitle(event.currentTarget.value)}
            placeholder="无标题"
            readOnly={runtime.offline || runtime.save.status === 'conflict'}
            value={runtime.title}
          />
        </h1>
        <TitleActions
          onTogglePanel={props.onTogglePanel}
          panelOpen={props.panelOpen}
          runtime={runtime}
        />
      </div>
    </>
  );
}
