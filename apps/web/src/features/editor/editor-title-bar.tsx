/** @fileoverview 渲染编辑会话的面包屑、标题输入与保存状态徽标。 */

'use client';

import Link from 'next/link';

import { DOCUMENT_TITLE_MAX_LENGTH } from '@everlearn/contracts';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@everlearn/ui';

import { SaveStatusBadge } from './save-status';
import type { SessionRuntime } from './document-session';

/** 用于渲染面包屑、标题输入与保存状态徽标。 */
export function TitleBar(props: {
  readonly autoFocus?: boolean | undefined;
  readonly knowledgeBaseId: string;
  readonly runtime: SessionRuntime;
}) {
  const { runtime } = props;
  return (
    <>
      <div className="mx-auto w-full max-w-prose px-6 pt-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:inline-flex">
              <BreadcrumbLink asChild>
                <Link href={`/knowledge/${props.knowledgeBaseId}`}>知识库</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage className="max-w-60 truncate">
                {runtime.title || '无标题'}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
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
        <SaveStatusBadge
          onCopyLocal={() => void runtime.copyLocal()}
          onRetry={runtime.save.retry}
          status={runtime.save.status}
        />
      </div>
    </>
  );
}
