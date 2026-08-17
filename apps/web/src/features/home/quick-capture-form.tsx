/** @fileoverview 渲染首页单行快速记录条并复用 Inbox 判别与写入。 */

'use client';

import { INBOX_ITEM_CONTENT_MAX_LENGTH } from '@everlearn/contracts';
import { CircleCheckIcon, Loader2Icon } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import type { FormEvent } from 'react';

import { Button, Field, FieldDescription, FieldError, FieldLabel, Input } from '@everlearn/ui';

import type { InboxApiFailure } from '../inbox/inbox-api';
import { createInboxItem } from '../inbox/inbox-api';
import { resolveRecordInput } from '../inbox/inbox-record-form';

type CaptureOutcome =
  { readonly kind: 'created' } | { readonly kind: 'failed'; readonly failure: InboxApiFailure };

/** 用于渲染写入成功后的确认与 Inbox 核对链接。 */
function QuickCaptureSuccess() {
  return (
    <p className="m-0 flex items-center gap-1.5 text-sm text-success">
      <CircleCheckIcon aria-hidden="true" />
      已记录到 Inbox。
      <Link className="text-primary underline underline-offset-4" href="/knowledge/inbox">
        打开 Inbox
      </Link>
    </p>
  );
}

/** 用于渲染失败原因且在结果未知时提供核对链接。 */
function QuickCaptureFailure({ failure }: { readonly failure: InboxApiFailure }) {
  return (
    <p className="m-0 text-sm text-destructive" role="alert">
      记录失败：{failure.message}
      {failure.certainty === 'unknown' && (
        <Link className="ml-1 underline underline-offset-4" href="/knowledge/inbox">
          打开 Inbox 核对
        </Link>
      )}
    </p>
  );
}

interface QuickCaptureControlProps {
  readonly blocked: boolean;
  readonly contentId: string;
  readonly disabled: boolean;
  readonly invalid: boolean;
  readonly onChange: (value: string) => void;
  readonly submitting: boolean;
  readonly value: string;
}

/** 用于渲染单行输入与提交按钮的组合。 */
function QuickCaptureControl(props: QuickCaptureControlProps) {
  const { blocked, contentId, disabled, invalid, onChange, submitting, value } = props;
  return (
    <div className="flex gap-2">
      <Input
        aria-invalid={invalid ? true : undefined}
        disabled={disabled}
        id={contentId}
        maxLength={INBOX_ITEM_CONTENT_MAX_LENGTH}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder="记录一个想法，或粘贴一条 http(s) 链接"
        type="text"
        value={value}
      />
      <Button disabled={disabled || blocked} type="submit" variant="secondary">
        {submitting && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        记录
      </Button>
    </div>
  );
}

interface QuickCaptureFormProps {
  readonly offline: boolean;
}

/** 用于解析判别与已知校验失败中的字段提示。 */
function resolveFieldError(
  resolved: ReturnType<typeof resolveRecordInput>,
  failed: InboxApiFailure | undefined,
): string | undefined {
  if (resolved.error) return resolved.error;
  if (failed?.code === 'VALIDATION_FAILED' && failed.certainty === 'known') {
    return failed.message;
  }
  return undefined;
}

interface QuickCaptureState {
  readonly change: (next: string) => void;
  readonly failed: InboxApiFailure | undefined;
  readonly submit: (event: FormEvent<HTMLFormElement>) => void;
  readonly submitting: boolean;
  readonly succeeded: boolean;
  readonly value: string;
}

/** 用于管理快速记录输入与提交的互斥结果状态。 */
function useQuickCapture(offline: boolean): QuickCaptureState {
  const [value, setValue] = useState('');
  const [outcome, setOutcome] = useState<CaptureOutcome>();
  const [submitting, setSubmitting] = useState(false);
  /** 用于在开始新输入时移除上一次的提交结果。 */
  function change(next: string): void {
    setValue(next);
    setOutcome(undefined);
  }
  /** 用于通过原生表单统一键盘与指针提交。 */
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void confirmSubmit();
  }
  /** 用于写入 Inbox 且只在服务端确认后清空输入。 */
  async function confirmSubmit(): Promise<void> {
    const request = resolveRecordInput(value).request;
    if (submitting || offline || !request) return;
    setSubmitting(true);
    setOutcome(undefined);
    const result = await createInboxItem(request);
    setSubmitting(false);
    if (result.ok) {
      setValue('');
      setOutcome({ kind: 'created' });
      return;
    }
    setOutcome({ kind: 'failed', failure: result.error });
  }
  return {
    change,
    failed: outcome?.kind === 'failed' ? outcome.failure : undefined,
    submit,
    submitting,
    succeeded: outcome?.kind === 'created',
    value,
  };
}

/** 用于把单行快速记录写入 Inbox 并按结果反馈与保留输入。 */
export function QuickCaptureForm(props: QuickCaptureFormProps) {
  const { offline } = props;
  const contentId = useId();
  const capture = useQuickCapture(offline);
  const resolved = resolveRecordInput(capture.value);
  const fieldError = resolveFieldError(resolved, capture.failed);
  return (
    <form className="grid gap-3" onSubmit={capture.submit}>
      <Field data-invalid={fieldError ? true : undefined}>
        <FieldLabel htmlFor={contentId}>内容</FieldLabel>
        <QuickCaptureControl
          blocked={capture.value.trim().length === 0 || Boolean(resolved.error) || offline}
          contentId={contentId}
          disabled={capture.submitting || offline}
          invalid={Boolean(fieldError)}
          onChange={capture.change}
          submitting={capture.submitting}
          value={capture.value}
        />
        <FieldDescription>
          单行且以 http:// 或 https:// 开头的内容按链接记录，其余按文本记录。
        </FieldDescription>
        {fieldError && <FieldError>{fieldError}</FieldError>}
        {capture.failed && !fieldError && <QuickCaptureFailure failure={capture.failed} />}
        {capture.succeeded && <QuickCaptureSuccess />}
      </Field>
    </form>
  );
}
