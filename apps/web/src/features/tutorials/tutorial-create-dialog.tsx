/**
 * @fileoverview 渲染新建教程的最小创建弹窗，创建成功后进入 compose 创作流。
 */

'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Textarea,
} from '@everlearn/ui';
import { Loader2Icon, PlusIcon } from 'lucide-react';

import { createTutorial } from './tutorials-api';

const DEPTH_OPTIONS = [
  { label: '概览', value: 'overview' },
  { label: '标准', value: 'standard' },
  { label: '深入', value: 'deep' },
] as const;

/** 最小创建表单的受控状态，仅主题必填。 */
interface CreateFormState {
  readonly audience: string;
  readonly depth: (typeof DEPTH_OPTIONS)[number]['value'];
  readonly goals: string;
  readonly topic: string;
}

const INITIAL_FORM: CreateFormState = { audience: '', depth: 'standard', goals: '', topic: '' };

/** 用于渲染新建教程入口与最小创建弹窗。 */
export function TutorialCreateDialog({
  triggerVariant = 'default',
}: {
  triggerVariant?: 'default' | 'outline';
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  /** 用于创建成功后关闭弹窗并跳转 compose 完成范围细化。 */
  const handleCreated = (tutorialId: string): void => {
    setOpen(false);
    router.push(`/tutorials/${tutorialId}/compose`);
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant}>
          <PlusIcon aria-hidden="true" />
          新建教程
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建教程</DialogTitle>
          <DialogDescription>
            只需一个主题即可开始，受众、目标与深度可以留待对话中细化。
          </DialogDescription>
        </DialogHeader>
        <CreateTutorialForm onCreated={handleCreated} />
      </DialogContent>
    </Dialog>
  );
}

/** 用于渲染最小创建表单并提交创建请求。 */
function CreateTutorialForm({ onCreated }: { onCreated: (tutorialId: string) => void }) {
  const [form, setForm] = useState<CreateFormState>(INITIAL_FORM);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  /** 用于提交最小字段并把失败文案留在弹窗内。 */
  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (pending || form.topic.trim().length === 0) return;
    setPending(true);
    setError(undefined);
    const audience = form.audience.trim();
    const goals = form.goals.trim();
    const result = await createTutorial({
      ...(audience ? { audience } : {}),
      depth: form.depth,
      ...(goals ? { goals } : {}),
      topic: form.topic.trim(),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setForm(INITIAL_FORM);
    onCreated(result.data.id);
  };

  return (
    <form aria-label="新建教程" className="grid gap-4" onSubmit={(e) => void handleSubmit(e)}>
      <CreateFormFields form={form} onChange={setForm} />
      {error && (
        <p className="m-0 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button className="w-fit" disabled={pending || form.topic.trim().length === 0} type="submit">
        {pending && <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />}
        创建并开始创作
      </Button>
    </form>
  );
}

/** 用于渲染最小创建表单的四个受控字段。 */
function CreateFormFields({
  form,
  onChange,
}: {
  form: CreateFormState;
  onChange: (form: CreateFormState) => void;
}) {
  return (
    <>
      <TextField
        id="create-topic"
        label="主题（必填）"
        onChange={(topic) => onChange({ ...form, topic })}
        placeholder="例如：React 性能优化"
        value={form.topic}
      />
      <TextField
        id="create-audience"
        label="受众（可选）"
        onChange={(audience) => onChange({ ...form, audience })}
        placeholder="例如：有一年前端经验的工程师"
        value={form.audience}
      />
      <div className="grid gap-1.5">
        <Label htmlFor="create-goals">学习目标（可选）</Label>
        <Textarea
          id="create-goals"
          onChange={(event) => onChange({ ...form, goals: event.target.value })}
          rows={2}
          value={form.goals}
        />
      </div>
      <DepthPicker depth={form.depth} onChange={(depth) => onChange({ ...form, depth })} />
    </>
  );
}

/** 用于渲染深度三选一。 */
function DepthPicker({
  depth,
  onChange,
}: {
  depth: CreateFormState['depth'];
  onChange: (depth: CreateFormState['depth']) => void;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="text-sm font-medium">深度</legend>
      <div aria-label="深度" className="flex gap-2" role="radiogroup">
        {DEPTH_OPTIONS.map((option) => (
          <Button
            aria-pressed={depth === option.value}
            key={option.value}
            onClick={() => onChange(option.value)}
            size="sm"
            type="button"
            variant={depth === option.value ? 'default' : 'outline'}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

/** 用于渲染一个带标签的文本输入。 */
function TextField({
  id,
  label,
  onChange,
  placeholder,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}
