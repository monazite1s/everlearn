/** @fileoverview 渲染知识库问答的提问输入、答案与引用链接。 */

'use client';

import { useState } from 'react';
import { Loader2Icon } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@everlearn/ui';

import { aiErrorMessage, requestAiQa, type AiQaAnswer } from './ai-api';

/** 问答流程的稳定状态。 */
type QaStatus = 'idle' | 'loading' | 'done' | 'error';

/** AiQaTab 的 props 契约。 */
export interface AiQaTabProps {
  readonly knowledgeBaseId: string;
}

/** 用于发起一次问答并归一结果状态。 */
function useAiQa(knowledgeBaseId: string) {
  const [status, setStatus] = useState<QaStatus>('idle');
  const [answer, setAnswer] = useState<AiQaAnswer | undefined>();
  const [errorText, setErrorText] = useState('');
  /** 用于提交问题并消费同步答案。 */
  function ask(question: string): void {
    setStatus('loading');
    setErrorText('');
    void requestAiQa(knowledgeBaseId, question).then((result) => {
      if (result.ok) {
        setAnswer(result.data);
        setStatus('done');
        return;
      }
      setErrorText(aiErrorMessage(result.error.code));
      setStatus('error');
    });
  }
  return { answer, ask, errorText, status };
}

/** 用于渲染引用列表并链接到对应文档。 */
function CitationList(props: {
  readonly citations: AiQaAnswer['citations'];
  readonly knowledgeBaseId: string;
}) {
  if (props.citations.length === 0) return null;
  return (
    <ul className="m-0 grid list-none gap-1 p-0">
      {props.citations.map((citation, index) => (
        <li key={`${citation.documentId}-${citation.blockId}`}>
          <Link
            className="text-sm text-primary underline underline-offset-2 hover:text-primary/80"
            href={`/knowledge/${props.knowledgeBaseId}/documents/${citation.documentId}`}
          >
            引用 {index + 1}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 用于渲染知识库问答页签的全部状态。 */
export function AiQaTab(props: AiQaTabProps) {
  const qa = useAiQa(props.knowledgeBaseId);
  const [question, setQuestion] = useState('');
  const busy = qa.status === 'loading';
  /** 用于提交非空问题。 */
  function submit(): void {
    const trimmed = question.trim();
    if (trimmed) qa.ask(trimmed);
  }
  return (
    <div className="grid gap-3">
      <textarea
        aria-label="问题"
        className="min-h-20 w-full rounded-md border bg-transparent p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        disabled={busy}
        maxLength={500}
        onChange={(event) => setQuestion(event.currentTarget.value)}
        placeholder="基于当前知识库提问。"
        value={question}
      />
      <Button disabled={busy || question.trim() === ''} onClick={submit} size="sm" type="button">
        {busy && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        提问
      </Button>
      {qa.status === 'error' && (
        <p className="m-0 text-sm text-destructive" role="alert">
          {qa.errorText}
        </p>
      )}
      {qa.status === 'done' && qa.answer && (
        <div aria-live="polite" className="grid gap-2">
          <p className="m-0 text-sm whitespace-pre-wrap">{qa.answer.answer}</p>
          <CitationList citations={qa.answer.citations} knowledgeBaseId={props.knowledgeBaseId} />
        </div>
      )}
    </div>
  );
}
