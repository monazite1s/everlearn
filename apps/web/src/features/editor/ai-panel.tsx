/** @fileoverview 组装 AI 助手两个页签并提供中屏 Sheet 形态。 */

'use client';

import type { Editor, JSONContent } from '@tiptap/core';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@everlearn/ui';

import { AiDraftTab } from './ai-draft-tab';
import { AiQaTab } from './ai-qa-tab';

// ponytail: 接受草稿为整篇替换而非块级 diff，升级路径为块级选择应用。
/** 用于把 AI 草稿写入编辑器并经更新事务走既有保存与修订流程。 */
export function applyAiDraft(editor: Editor | null, contentJson: unknown, close: () => void): void {
  editor?.commands.setContent(contentJson as JSONContent);
  close();
}

/** AI 助手面板的共享契约。 */
export interface AiPanelProps {
  readonly documentId: string;
  /** 用于接受草稿后整体替换文档正文。 */
  readonly onAccept: (contentJson: unknown) => void;
  readonly knowledgeBaseId: string;
}

/** 用于渲染生成草稿与知识库问答两个页签。 */
export function AiPanel(props: AiPanelProps) {
  return (
    <Tabs defaultValue="draft">
      <TabsList className="w-full">
        <TabsTrigger value="draft">生成草稿</TabsTrigger>
        <TabsTrigger value="qa">知识库问答</TabsTrigger>
      </TabsList>
      <TabsContent value="draft">
        <AiDraftTab documentId={props.documentId} onAccept={props.onAccept} />
      </TabsContent>
      <TabsContent value="qa">
        <AiQaTab knowledgeBaseId={props.knowledgeBaseId} />
      </TabsContent>
    </Tabs>
  );
}

/** AiPanelSheet 的 props 契约。 */
export interface AiPanelSheetProps extends AiPanelProps {
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}

/** 用于在非宽屏下以右侧 Sheet 承载 AI 助手。 */
export function AiPanelSheet(props: AiPanelSheetProps) {
  const { onOpenChange, open, ...panel } = props;
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="overflow-y-auto" side="right">
        <SheetHeader>
          <SheetTitle>AI 助手</SheetTitle>
          <SheetDescription>生成草稿或基于知识库问答。</SheetDescription>
        </SheetHeader>
        <AiPanel {...panel} />
      </SheetContent>
    </Sheet>
  );
}
