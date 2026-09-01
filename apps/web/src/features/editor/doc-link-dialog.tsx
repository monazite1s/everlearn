/** @fileoverview 弹层内按标题全局搜索文档并返回选中目标，用于插入内部链接。 */

'use client';

import { useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from '@everlearn/ui';

import { useTitleSearch } from './use-title-search';

/** DocLinkDialog 的 props 契约。 */
export interface DocLinkDialogProps {
  readonly onOpenChange: (open: boolean) => void;
  /** 用于接收选中的目标文档 ID 并包住当前选区。 */
  readonly onPick: (documentId: string) => void;
  readonly open: boolean;
}

/** 用于渲染候选文档标题列表。 */
function CandidateList(props: {
  readonly candidates: readonly { documentId: string; title: string }[];
  readonly failed: boolean;
  readonly hasQuery: boolean;
  readonly onPick: (documentId: string) => void;
}) {
  return (
    <>
      <ul className="m-0 max-h-64 list-none overflow-y-auto p-0">
        {props.candidates.map((candidate) => (
          <li key={candidate.documentId}>
            <Button
              className="w-full justify-start px-2 font-normal"
              onClick={() => props.onPick(candidate.documentId)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <span className="truncate">{candidate.title}</span>
            </Button>
          </li>
        ))}
      </ul>
      {props.hasQuery && props.candidates.length === 0 && !props.failed && (
        <p className="m-0 text-sm text-muted-foreground">没有匹配的文档。</p>
      )}
      {props.failed && (
        <p className="m-0 text-sm text-destructive" role="alert">
          搜索失败，请重试。
        </p>
      )}
    </>
  );
}

/** 用于渲染文档标题搜索弹层并回传选中目标。 */
export function DocLinkDialog(props: DocLinkDialogProps) {
  const [draft, setDraft] = useState('');
  const { candidates, failed } = useTitleSearch({ draft, open: props.open });

  /** 用于把选中目标交给宿主并关闭弹层。 */
  function pick(documentId: string): void {
    props.onPick(documentId);
    props.onOpenChange(false);
  }

  return (
    <Dialog onOpenChange={props.onOpenChange} open={props.open}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>插入文档链接</DialogTitle>
          <DialogDescription>搜索库内文档标题，选中后链接当前选中文本。</DialogDescription>
        </DialogHeader>
        <Input
          aria-label="搜索文档标题"
          autoFocus
          onChange={(event) => setDraft(event.currentTarget.value)}
          placeholder="输入标题关键字"
          value={draft}
        />
        <CandidateList
          candidates={candidates}
          failed={failed}
          hasQuery={draft.trim().length > 0}
          onPick={pick}
        />
      </DialogContent>
    </Dialog>
  );
}
