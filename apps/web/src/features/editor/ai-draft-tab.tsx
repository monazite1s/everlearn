/** @fileoverview 渲染 AI 草稿生成的指令输入、流式预览与接受/放弃操作。 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2Icon, SquareIcon } from 'lucide-react';

import { Button } from '@everlearn/ui';

import { markdownToDocJson } from './markdown-conversion';
import { aiErrorMessage, streamAiDraft } from './ai-api';

/** 生成流程的稳定状态。 */
type DraftStatus = 'idle' | 'streaming' | 'done' | 'error';

/** AiDraftTab 的 props 契约。 */
export interface AiDraftTabProps {
  readonly documentId: string;
  /** 用于接受草稿：提交转换后的正文 JSON 由宿主整体替换正文。 */
  readonly onAccept: (contentJson: unknown) => void;
}

/** 草稿流执行过程中回调给界面的状态变更。 */
interface DraftStreamHandlers {
  readonly onDelta: (delta: string) => void;
  readonly onError: (message: string) => void;
  readonly onEnd: (outcome: 'aborted' | 'done' | 'error') => void;
}

/** 用于消费一次草稿 SSE 流并把帧归一为界面事件。 */
function runDraftStream(
  documentId: string,
  instruction: string,
  controller: AbortController,
  handlers: DraftStreamHandlers,
): void {
  let failed = false;
  void streamAiDraft(
    documentId,
    instruction,
    (frame) => {
      if (frame.error !== undefined) {
        failed = true;
        handlers.onError(aiErrorMessage(frame.error));
        return;
      }
      // 帧粒度即 LLM 增量粒度，直接渲染；帧率显著变高时再引入节流缓冲。
      handlers.onDelta(frame.delta);
    },
    controller.signal,
  ).then((outcome) => {
    if (outcome === 'failed') {
      handlers.onError('生成连接中断，请重试。');
      handlers.onEnd('error');
      return;
    }
    if (outcome === 'aborted') {
      handlers.onEnd('aborted');
      return;
    }
    handlers.onEnd(failed ? 'error' : 'done');
  });
}

/** 用于流式接收草稿增量并归一为可展示状态。 */
function useAiDraft(documentId: string) {
  const [status, setStatus] = useState<DraftStatus>('idle');
  const [draft, setDraft] = useState('');
  const [errorText, setErrorText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  useEffect(
    /** 用于卸载时中止进行中的流式请求。 */ function abortOnUnmount(): () => void {
      return () => abortRef.current?.abort();
    },
    [],
  );
  /** 用于发起一次草稿生成并消费 SSE 帧。 */
  function generate(instruction: string): void {
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('streaming');
    setDraft('');
    setErrorText('');
    runDraftStream(documentId, instruction, controller, {
      onDelta: /** 用于把增量追加到预览文本。 */ (delta) => setDraft((current) => current + delta),
      onError: /** 用于记录当前错误的可行动文案。 */ setErrorText,
      onEnd: /** 用于按结束原因收敛到最终状态。 */ (outcome) => {
        abortRef.current = null;
        if (outcome === 'aborted') {
          setStatus('idle');
          setDraft('');
          return;
        }
        setStatus(outcome === 'error' ? 'error' : 'done');
      },
    });
  }
  return {
    cancel: /** 用于中止流式请求并清空预览。 */ () => abortRef.current?.abort(),
    discard: /** 用于放弃草稿，零写入直接回到初始态。 */ () => {
      setDraft('');
      setStatus('idle');
    },
    draft,
    errorText,
    generate,
    status,
  };
}

/** 用于渲染流式中的预览与停止按钮。 */
function StreamingPreview(props: { readonly draft: string; readonly onCancel: () => void }) {
  return (
    <div className="grid gap-2">
      <div
        aria-live="polite"
        className="max-h-72 overflow-y-auto rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap"
      >
        {props.draft || '正在生成…'}
      </div>
      <Button onClick={props.onCancel} size="sm" type="button" variant="outline">
        <SquareIcon aria-hidden="true" />
        停止生成
      </Button>
    </div>
  );
}

/** 用于渲染完成后带接受/放弃的预览。 */
function FinishedPreview(props: {
  readonly draft: string;
  readonly onAccept: () => void;
  readonly onDiscard: () => void;
}) {
  return (
    <div className="grid gap-2">
      <div className="max-h-72 overflow-y-auto rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap">
        {props.draft}
      </div>
      <div className="flex gap-2">
        <Button onClick={props.onAccept} size="sm" type="button">
          接受并替换正文
        </Button>
        <Button onClick={props.onDiscard} size="sm" type="button" variant="outline">
          放弃
        </Button>
      </div>
    </div>
  );
}

/** 用于渲染草稿生成页签的全部状态。 */
export function AiDraftTab(props: AiDraftTabProps) {
  const { documentId, onAccept } = props;
  const draft = useAiDraft(documentId);
  const [instruction, setInstruction] = useState('');
  const busy = draft.status === 'streaming';
  /** 用于提交指令并触发流式生成。 */
  function start(): void {
    const trimmed = instruction.trim();
    if (trimmed) draft.generate(trimmed);
  }
  return (
    <div className="grid gap-3">
      <textarea
        aria-label="生成指令"
        className="min-h-20 w-full rounded-md border bg-transparent p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        disabled={busy}
        maxLength={2000}
        onChange={(event) => setInstruction(event.currentTarget.value)}
        placeholder="描述要生成的草稿，例如：为本文写一段总结。"
        value={instruction}
      />
      <Button disabled={busy || instruction.trim() === ''} onClick={start} size="sm" type="button">
        {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        生成草稿
      </Button>
      {draft.status === 'error' && (
        <p className="m-0 text-sm text-destructive" role="alert">
          {draft.errorText}
        </p>
      )}
      {busy && <StreamingPreview draft={draft.draft} onCancel={draft.cancel} />}
      {draft.status === 'done' && (
        <FinishedPreview
          draft={draft.draft}
          onAccept={() => onAccept(markdownToDocJson(draft.draft))}
          onDiscard={draft.discard}
        />
      )}
    </div>
  );
}
