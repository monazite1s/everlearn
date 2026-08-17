/** @fileoverview 渲染 Inbox 快速记录表单并判别文本或链接载荷。 */

'use client';

import {
  INBOX_ITEM_CONTENT_MAX_LENGTH,
  type CreateInboxItemRequest,
  type InboxItemSummary,
} from '@everlearn/contracts';
import { AlertCircleIcon, Loader2Icon } from 'lucide-react';
import { useId, useState } from 'react';
import type { FormEvent, RefObject } from 'react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Textarea,
} from '@everlearn/ui';

import type { InboxApiFailure } from './inbox-api';
import { createInboxItem } from './inbox-api';

interface ResolvedInput {
  readonly error?: string;
  readonly request?: CreateInboxItemRequest;
}

/** 用于按服务端同款规则解析 http/https 绝对链接。 */
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** 用于把单一输入判别为互斥的文本或链接载荷。 */
export function resolveRecordInput(raw: string): ResolvedInput {
  const value = raw.trim();
  if (value.length === 0) return {};
  if (value.length > INBOX_ITEM_CONTENT_MAX_LENGTH) {
    return { error: `内容不能超过 ${INBOX_ITEM_CONTENT_MAX_LENGTH} 个字符。` };
  }
  const looksLikeUrl = value.startsWith('http://') || value.startsWith('https://');
  if (looksLikeUrl && !value.includes('\n')) {
    if (!isHttpUrl(value)) {
      return {
        error: '以 http(s):// 开头的单行内容将按链接记录：请补全链接，或另起一行按文本记录。',
      };
    }
    return { request: { url: value } };
  }
  return { request: { text: value } };
}

/** 用于解析客户端判别与已知校验失败中的字段提示。 */
function resolveFieldError(
  resolved: ResolvedInput,
  failure: InboxApiFailure | undefined,
): string | undefined {
  if (resolved.error) return resolved.error;
  if (failure?.code === 'VALIDATION_FAILED' && failure.certainty === 'known') {
    return failure.message;
  }
  return undefined;
}

/** 用于渲染记录表单的提交失败提示。 */
function RecordFailureAlert({ message }: { message: string }) {
  return (
    <Alert variant="destructive">
      <AlertCircleIcon aria-hidden="true" />
      <AlertTitle>记录失败</AlertTitle>
      <AlertDescription>
        <p className="m-0">{message}</p>
      </AlertDescription>
    </Alert>
  );
}

interface ContentFieldProps {
  readonly disabled: boolean;
  readonly error?: string;
  readonly id: string;
  readonly inputRef: RefObject<HTMLTextAreaElement | null>;
  readonly onChange: (value: string) => void;
  readonly value: string;
}

/** 用于渲染带判别说明与字段提示的记录输入。 */
function InboxContentField(props: ContentFieldProps) {
  const { disabled, error, id, inputRef, onChange, value } = props;
  return (
    <FieldGroup>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={id}>内容</FieldLabel>
        <Textarea
          aria-invalid={error ? true : undefined}
          disabled={disabled}
          id={id}
          maxLength={INBOX_ITEM_CONTENT_MAX_LENGTH}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder="记录一个想法，或粘贴一条 http(s) 链接"
          ref={inputRef}
          rows={3}
          value={value}
        />
        <FieldDescription>
          单行且以 http:// 或 https:// 开头的内容按链接记录，其余按文本记录。
        </FieldDescription>
        {error && <FieldError>{error}</FieldError>}
      </Field>
    </FieldGroup>
  );
}

interface InboxRecordFormProps {
  readonly inputRef: RefObject<HTMLTextAreaElement | null>;
  readonly offline: boolean;
  readonly onCreated: (item: InboxItemSummary) => void;
  readonly onUncertainOutcome: () => Promise<void> | void;
}

/** 用于提交快速记录并在失败后保留输入。 */
export function InboxRecordForm(props: InboxRecordFormProps) {
  const { inputRef, offline, onCreated, onUncertainOutcome } = props;
  const contentId = useId();
  const [value, setValue] = useState('');
  const [failure, setFailure] = useState<InboxApiFailure>();
  const [submitting, setSubmitting] = useState(false);
  const resolved = resolveRecordInput(value);
  const fieldError = resolveFieldError(resolved, failure);
  const invalid = value.trim().length === 0 || Boolean(resolved.error) || offline;
  /** 用于通过原生表单提交统一键盘和指针行为。 */
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void confirmSubmit();
  }
  /** 用于创建记录并只在服务端确认后清空输入。 */
  async function confirmSubmit(): Promise<void> {
    if (submitting || offline || !resolved.request) return;
    setSubmitting(true);
    setFailure(undefined);
    const result = await createInboxItem(resolved.request);
    setSubmitting(false);
    if (result.ok) {
      setValue('');
      onCreated(result.data);
      return;
    }
    setFailure(result.error);
    if (result.error.certainty === 'unknown') await onUncertainOutcome();
  }
  return (
    <form className="grid gap-4" onSubmit={submit}>
      {failure && !fieldError && <RecordFailureAlert message={failure.message} />}
      <InboxContentField
        disabled={submitting || offline}
        {...(fieldError ? { error: fieldError } : {})}
        id={contentId}
        inputRef={inputRef}
        onChange={setValue}
        value={value}
      />
      <div className="flex justify-end">
        <Button disabled={invalid || submitting} type="submit">
          {submitting && <Loader2Icon aria-hidden="true" className="animate-spin" />}
          记录
        </Button>
      </div>
    </form>
  );
}
