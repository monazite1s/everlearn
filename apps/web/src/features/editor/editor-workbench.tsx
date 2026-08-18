/** @fileoverview 管理编辑会话内容并在重载或恢复后整体重挂会话。 */

'use client';

import { useState } from 'react';

import type { DocumentContentDetail } from '@everlearn/contracts';

import { DocumentEditorSession } from './document-session';

/** EditorWorkbench 的 props 契约。 */
export interface EditorWorkbenchProps {
  readonly initialDetail: DocumentContentDetail;
  /** 当前知识库显示名，面包屑首项使用。 */
  readonly kbName?: string | undefined;
  readonly knowledgeBaseId: string;
  readonly offline: boolean;
  readonly wide: boolean;
}

/** 用于持有当前会话内容并在重载或恢复后整体重挂编辑会话。 */
export function EditorWorkbench(props: EditorWorkbenchProps) {
  const [session, setSession] = useState({ detail: props.initialDetail, key: 0 });
  return (
    <DocumentEditorSession
      autoFocusTitle={session.key > 0}
      detail={session.detail}
      key={session.key}
      kbName={props.kbName}
      knowledgeBaseId={props.knowledgeBaseId}
      offline={props.offline}
      onReplace={(detail) => setSession((current) => ({ detail, key: current.key + 1 }))}
      wide={props.wide}
    />
  );
}
