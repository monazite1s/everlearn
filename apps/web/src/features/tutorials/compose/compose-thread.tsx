/**
 * @fileoverview compose 左栏对话流：消息列表、确认卡决议与消息输入区。
 */

'use client';

import { useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { Button, Textarea } from '@everlearn/ui';
import { Loader2Icon, SendIcon } from 'lucide-react';

import { ConfirmationCard } from './confirmation-card';
import type { CardDecision } from './use-compose-session';
import { newIdempotencyKey } from './use-compose-session';
import type { ComposeCard, ComposeMessage, ComposeSnapshot } from '../tutorials-contract';

/** 对话流的输入。 */
interface ComposeThreadProps {
  readonly disabled: boolean;
  readonly onDecide: (card: ComposeCard, decision: CardDecision) => Promise<string | undefined>;
  readonly onSend: (content: string, idempotencyKey: string) => Promise<string | undefined>;
  readonly snapshot: ComposeSnapshot;
}

/** 用于渲染消息列表与底部输入框并处理发送失败重试。 */
export function ComposeThread({ disabled, onDecide, onSend, snapshot }: ComposeThreadProps) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [sendError, setSendError] = useState<string | undefined>(undefined);
  const keyRef = useRef<string>(newIdempotencyKey());
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /** 用于以给定幂等键发送草稿，失败保留内容供重试。 */
  const sendDraft = async (event: FormEvent, key: string): Promise<void> => {
    event.preventDefault();
    const content = draft.trim();
    if (pending || disabled || content.length === 0) return;
    setPending(true);
    setSendError(undefined);
    const failure = await onSend(content, key);
    setPending(false);
    if (failure !== undefined) {
      setSendError(failure);
      return;
    }
    setDraft('');
    keyRef.current = newIdempotencyKey();
  };

  /** 用于把提案修改意向预填到输入框并聚焦。 */
  const requestRevision = (title: string): void => {
    setDraft(`关于「${title}」，我希望调整为：`);
    inputRef.current?.focus();
  };

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <MessageList
        messages={snapshot.messages}
        onDecide={onDecide}
        onRequestRevision={requestRevision}
      />
      <MessageInput
        busy={disabled || pending}
        draft={draft}
        error={sendError}
        inputRef={inputRef}
        onDraftChange={setDraft}
        onRetry={(event) => void sendDraft(event, keyRef.current)}
        onSubmit={(event) => void sendDraft(event, keyRef.current)}
      />
    </div>
  );
}

/** 用于渲染按角色排列的消息气泡列表。 */
function MessageList({
  messages,
  onDecide,
  onRequestRevision,
}: {
  messages: readonly ComposeMessage[];
  onDecide: (card: ComposeCard, decision: CardDecision) => Promise<string | undefined>;
  onRequestRevision: (title: string) => void;
}) {
  return (
    <ol aria-label="创作对话" className="m-0 grid list-none gap-3 overflow-y-auto p-0">
      {messages.map((message) => (
        <li key={message.id}>
          <MessageBubble
            message={message}
            onDecide={onDecide}
            onRequestRevision={onRequestRevision}
          />
        </li>
      ))}
    </ol>
  );
}

/** 用于渲染单条消息气泡，确认卡消息内嵌确认卡。 */
function MessageBubble({
  message,
  onDecide,
  onRequestRevision,
}: {
  message: ComposeMessage;
  onDecide: (card: ComposeCard, decision: CardDecision) => Promise<string | undefined>;
  onRequestRevision: (title: string) => void;
}) {
  return (
    <div
      className={`grid gap-1 ${message.role === 'user' ? 'justify-items-end' : 'justify-items-start'}`}
    >
      <span className="sr-only">{message.role === 'user' ? '我：' : 'Agent：'}</span>
      {message.text && (
        <p
          className={`m-0 max-w-full rounded-lg px-3 py-2 text-sm ${
            message.role === 'user'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-foreground'
          }`}
        >
          {message.text}
        </p>
      )}
      {message.card && (
        <ConfirmationCard
          card={message.card}
          onDecide={onDecide}
          onRequestRevision={onRequestRevision}
        />
      )}
    </div>
  );
}

/** 输入区的渲染输入。 */
interface MessageInputProps {
  readonly busy: boolean;
  readonly draft: string;
  readonly error: string | undefined;
  readonly inputRef: React.RefObject<HTMLTextAreaElement | null>;
  readonly onDraftChange: (draft: string) => void;
  readonly onRetry: (event: FormEvent) => void;
  readonly onSubmit: (event: FormEvent) => void;
}

/** 用于渲染受控输入框、发送按钮与失败重试入口。 */
function MessageInput({
  busy,
  draft,
  error,
  inputRef,
  onDraftChange,
  onRetry,
  onSubmit,
}: MessageInputProps) {
  return (
    <form aria-label="发送消息" className="grid gap-2" onSubmit={onSubmit}>
      <Textarea
        aria-label="输入消息"
        disabled={busy}
        onChange={(event) => onDraftChange(event.target.value)}
        placeholder="向 Agent 描述想要的教程调整…"
        ref={inputRef}
        rows={2}
        value={draft}
      />
      {error && (
        <p className="m-0 text-sm text-destructive" role="alert">
          {error}{' '}
          <Button
            className="h-auto px-1 py-0"
            onClick={onRetry}
            size="xs"
            type="button"
            variant="link"
          >
            重试发送
          </Button>
        </p>
      )}
      <Button className="w-fit" disabled={busy || draft.trim().length === 0} type="submit">
        {busy ? (
          <Loader2Icon aria-hidden="true" className="animate-spin" />
        ) : (
          <SendIcon aria-hidden="true" />
        )}
        发送
      </Button>
    </form>
  );
}
