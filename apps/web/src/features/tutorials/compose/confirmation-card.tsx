/**
 * @fileoverview compose 对话内的确认卡：提案内容、差异与接受、拒绝、提出修改决议。
 */

'use client';

import { useState } from 'react';

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@everlearn/ui';
import { CheckIcon, Loader2Icon, XIcon } from 'lucide-react';

import type { CardDecision } from './use-compose-session';
import type { ComposeCard, ComposeDiffSection } from '../tutorials-contract';

/** 确认卡的输入。 */
export interface ConfirmationCardProps {
  readonly card: ComposeCard;
  readonly onDecide: (card: ComposeCard, decision: CardDecision) => Promise<string | undefined>;
  readonly onRequestRevision: (title: string) => void;
}

/** 用于渲染一张确认卡及其决议状态，pending 才展示操作。 */
export function ConfirmationCard({ card, onDecide, onRequestRevision }: ConfirmationCardProps) {
  const [pending, setPending] = useState<'accept' | 'reject' | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  /** 用于执行决议并把失败文案就地展示。 */
  const decide = async (decision: 'accept' | 'reject'): Promise<void> => {
    if (pending !== null) return;
    setPending(decision);
    setError(undefined);
    const failure = await onDecide(card, decision);
    setPending(null);
    if (failure !== undefined) setError(failure);
  };

  return (
    <Card className="w-full max-w-md gap-2 py-4">
      <CardHeader className="px-4">
        <CardDescription>{describeVariant(card)}</CardDescription>
        <CardTitle className="text-title-small text-foreground">{card.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 px-4">
        <p className="m-0 text-sm text-muted-foreground">{card.body}</p>
        {card.diff && <DiffSections sections={card.diff.sections} />}
        <DecisionArea
          card={card}
          error={error}
          onDecide={(decision) => void decide(decision)}
          onRequestRevision={onRequestRevision}
          pending={pending}
        />
      </CardContent>
    </Card>
  );
}

/** 用于描述确认卡的类型前缀。 */
function describeVariant(card: ComposeCard): string {
  if (card.variant === 'gate') return '确认闸门';
  if (card.variant === 'diff') return '章节改写差异';
  return 'Agent 提案';
}

/** 用于渲染差异段落，改动前后并列呈现。 */
function DiffSections({ sections }: { sections: readonly ComposeDiffSection[] }) {
  return (
    <dl className="m-0 grid gap-2 rounded-md border border-border p-2 text-xs">
      {sections.map((section) => (
        <div className="grid gap-0.5" key={section.name}>
          <dt className="font-medium text-foreground">{section.name}</dt>
          <dd className="m-0 text-muted-foreground">
            <span className="block">原文：{section.before}</span>
            <span className="block text-foreground">改为：{section.after}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** 用于渲染已决议卡片的回执状态。 */
function DecisionReceipt({ state }: { state: 'accepted' | 'rejected' }) {
  if (state === 'accepted') {
    return (
      <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="default">已接受</Badge>
        已按此决议执行。
      </p>
    );
  }
  return (
    <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground">
      <Badge variant="destructive">已拒绝</Badge>
      未产生任何变更。
    </p>
  );
}

/** 用于渲染 pending 卡片的接受、拒绝与提出修改操作。 */
function DecisionButtons(props: {
  card: ComposeCard;
  onDecide: (decision: 'accept' | 'reject') => void;
  onRequestRevision: (title: string) => void;
  pending: 'accept' | 'reject' | null;
}) {
  const { card, onDecide, onRequestRevision, pending } = props;
  const busy = pending !== null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy} onClick={() => onDecide('accept')} size="sm" type="button">
        {pending === 'accept' && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        <CheckIcon aria-hidden="true" />
        {card.variant === 'diff' ? '接受差异' : '接受'}
      </Button>
      {card.variant !== 'gate' && (
        <Button
          disabled={busy}
          onClick={() => onDecide('reject')}
          size="sm"
          type="button"
          variant="outline"
        >
          {pending === 'reject' && <Loader2Icon aria-hidden="true" className="animate-spin" />}
          <XIcon aria-hidden="true" />
          拒绝
        </Button>
      )}
      <Button
        disabled={busy}
        onClick={() => onRequestRevision(card.title)}
        size="sm"
        type="button"
        variant="ghost"
      >
        提出修改
      </Button>
    </div>
  );
}

/** 用于按卡片状态渲染操作组或已决议回执。 */
function DecisionArea(props: {
  card: ComposeCard;
  error: string | undefined;
  onDecide: (decision: 'accept' | 'reject') => void;
  onRequestRevision: (title: string) => void;
  pending: 'accept' | 'reject' | null;
}) {
  const { card, error, onDecide, onRequestRevision, pending } = props;
  if (card.state !== 'pending') {
    return <DecisionReceipt state={card.state} />;
  }
  return (
    <div className="grid gap-1">
      <DecisionButtons
        card={card}
        onDecide={onDecide}
        onRequestRevision={onRequestRevision}
        pending={pending}
      />
      {error && (
        <p className="m-0 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
