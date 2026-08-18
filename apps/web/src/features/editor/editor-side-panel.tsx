/** @fileoverview 渲染修订与属性共享 Tabs 容器及其 Sheet 形态。 */

'use client';

import type { DocumentContentDetail } from '@everlearn/contracts';

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

import { extractAttachmentRefs } from './properties-panel';
import { PropertiesPanel } from './properties-panel';
import { RevisionTimelinePanel } from './revisions-panel';
import { useRevisions } from './use-revisions';

/** 侧栏面板共享的数据与回调契约。 */
export interface EditorPanelTabsProps {
  readonly contentDetail: DocumentContentDetail;
  readonly contentJson: unknown;
  readonly documentId: string;
  readonly getVersion: () => number;
  readonly onRestored: (detail: DocumentContentDetail) => void;
}

/** 用于渲染历史与信息两个页签及其内容。 */
export function EditorPanelTabs(props: EditorPanelTabsProps) {
  const revisions = useRevisions({ documentId: props.documentId });
  return (
    <Tabs defaultValue="revisions">
      <TabsList className="w-full">
        <TabsTrigger value="revisions">历史</TabsTrigger>
        <TabsTrigger value="properties">信息</TabsTrigger>
      </TabsList>
      <TabsContent value="revisions">
        <RevisionTimelinePanel
          documentId={props.documentId}
          getVersion={props.getVersion}
          onRestored={props.onRestored}
          revisions={revisions}
        />
      </TabsContent>
      <TabsContent value="properties">
        <PropertiesPanel
          attachmentRefs={extractAttachmentRefs(props.contentJson)}
          contentDetail={props.contentDetail}
        />
      </TabsContent>
    </Tabs>
  );
}

/** EditorPanelSheet 的 props 契约。 */
export interface EditorPanelSheetProps extends EditorPanelTabsProps {
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}

/** 用于在中等宽度下以右侧 Sheet 承载同一面板容器。 */
export function EditorPanelSheet(props: EditorPanelSheetProps) {
  const { onOpenChange, open, ...tabs } = props;
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="overflow-y-auto" side="right">
        <SheetHeader>
          <SheetTitle>文档信息</SheetTitle>
          <SheetDescription>查看文档历史与信息。</SheetDescription>
        </SheetHeader>
        <EditorPanelTabs {...tabs} />
      </SheetContent>
    </Sheet>
  );
}
