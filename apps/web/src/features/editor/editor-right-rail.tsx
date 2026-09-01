/** @fileoverview 渲染编辑会话右栏：宽屏常驻信息与 AI 助手组合，中屏以 Sheet 承载 AI 助手。 */

'use client';

import type { ReactNode } from 'react';

import { AiPanel, AiPanelSheet } from './ai-panel';

/** EditorRightRail 的 props 契约。 */
export interface EditorRightRailProps {
  readonly aiOpen: boolean;
  readonly documentId: string;
  readonly infoTabs: ReactNode;
  readonly knowledgeBaseId: string;
  /** 用于接受 AI 草稿后整体替换文档正文。 */
  readonly onAccept: (contentJson: unknown) => void;
  readonly onToggleAi: () => void;
  readonly panelCollapsed: boolean;
  readonly wide: boolean;
}

/** 用于按宽度渲染 AI 助手与信息面板的右栏组合。 */
export function EditorRightRail(props: EditorRightRailProps) {
  const aiPanel = (
    <AiPanel
      documentId={props.documentId}
      knowledgeBaseId={props.knowledgeBaseId}
      onAccept={props.onAccept}
    />
  );
  if (!props.wide) {
    return (
      <AiPanelSheet
        documentId={props.documentId}
        knowledgeBaseId={props.knowledgeBaseId}
        onAccept={props.onAccept}
        onOpenChange={(open) => {
          if (!open) props.onToggleAi();
        }}
        open={props.aiOpen}
      />
    );
  }
  const showInfo = !props.panelCollapsed;
  if (!showInfo && !props.aiOpen) return null;
  return (
    <aside
      aria-label="文档信息"
      className="min-w-0 overflow-y-auto border-l border-border px-4 py-4"
    >
      {showInfo && props.infoTabs}
      {props.aiOpen && <div className={showInfo ? 'mt-6 border-t pt-4' : undefined}>{aiPanel}</div>}
    </aside>
  );
}
