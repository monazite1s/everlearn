/**
 * @fileoverview 渲染教程范围表单字段，供创建与草稿编辑复用。
 */

'use client';

import { Button, Input, Label, Textarea } from '@everlearn/ui';
import { Loader2Icon } from 'lucide-react';
import type { FormEvent } from 'react';

import type { ScopeFormState } from './tutorial-scope-form';

interface ScopeFieldsProps {
  disabled?: boolean;
  /** 是否展示知识库多选（草稿编辑时已锁定范围不再展示）。 */
  includeKnowledgePicker: boolean;
  knowledgeBases: readonly { readonly id: string; readonly name: string }[];
  onChange: (form: ScopeFormState) => void;
  onSubmit: (event: FormEvent) => void;
  pending: boolean;
  submitLabel: string;
  value: ScopeFormState;
}

/** 用于渲染教程范围表单的可复用字段集。 */
export function ScopeFields({
  disabled = false,
  includeKnowledgePicker,
  knowledgeBases,
  onChange,
  onSubmit,
  pending,
  submitLabel,
  value,
}: ScopeFieldsProps) {
  /** 用于合并一次受控字段更新。 */
  const update = (patch: Partial<ScopeFormState>): ScopeFormState => {
    const next = { ...value, ...patch };
    onChange(next);
    return next;
  };
  const canSubmit = !pending && value.topic.trim().length > 0;
  return (
    <form aria-label="教程范围" className="grid gap-3" onSubmit={onSubmit}>
      <TopicGrid update={update} value={value} />
      <DepthTopicsGrid update={update} value={value} />
      {includeKnowledgePicker && (
        <KnowledgePicker
          knowledgeBases={knowledgeBases}
          selected={value.knowledgeBaseIds}
          onToggle={(id) =>
            update({
              knowledgeBaseIds: value.knowledgeBaseIds.includes(id)
                ? value.knowledgeBaseIds.filter((item) => item !== id)
                : [...value.knowledgeBaseIds, id],
            })
          }
        />
      )}
      <Button className="w-fit" disabled={disabled || !canSubmit} type="submit">
        {pending && <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  );
}

/** 用于渲染主题、受众与水平字段网格。 */
function TopicGrid({
  update,
  value,
}: {
  update: (patch: Partial<ScopeFormState>) => ScopeFormState;
  value: ScopeFormState;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <TextField
        id="tutorial-topic"
        label="主题"
        onChange={(topic) => update({ topic })}
        placeholder="例如：React 性能优化"
        value={value.topic}
      />
      <TextField
        id="tutorial-audience"
        label="受众"
        onChange={(audience) => update({ audience })}
        placeholder="例如：有一年前端经验的工程师"
        value={value.audience}
      />
      <TextField
        id="tutorial-level"
        label="水平"
        onChange={(level) => update({ level })}
        placeholder="例如：中级"
        value={value.level}
      />
    </div>
  );
}

/** 用于渲染深度与主题取舍字段网格。 */
function DepthTopicsGrid({
  update,
  value,
}: {
  update: (patch: Partial<ScopeFormState>) => ScopeFormState;
  value: ScopeFormState;
}) {
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor="tutorial-goals">学习目标</Label>
        <Textarea
          id="tutorial-goals"
          onChange={(event) => update({ goals: event.target.value })}
          rows={2}
          value={value.goals}
        />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <DepthField onChange={(depth) => update({ depth })} value={value.depth} />
        <TextField
          id="tutorial-include"
          label="包含主题（逗号分隔，可空）"
          onChange={(include) => update({ include })}
          value={value.include}
        />
        <TextField
          id="tutorial-exclude"
          label="排除主题（逗号分隔，可空）"
          onChange={(exclude) => update({ exclude })}
          value={value.exclude}
        />
      </div>
    </>
  );
}

/** 用于渲染深度三选一。 */
function DepthField({
  onChange,
  value,
}: {
  onChange: (depth: ScopeFormState['depth']) => void;
  value: ScopeFormState['depth'];
}) {
  const options = [
    { label: '概览', value: 'overview' },
    { label: '标准', value: 'standard' },
    { label: '深入', value: 'deep' },
  ] as const;
  return (
    <div className="grid gap-1.5">
      <Label>深度</Label>
      <div className="flex gap-2" role="radiogroup" aria-label="深度">
        {options.map((option) => (
          <Button
            aria-pressed={value === option.value}
            key={option.value}
            onClick={() => onChange(option.value)}
            size="sm"
            type="button"
            variant={value === option.value ? 'default' : 'outline'}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/** 用于渲染知识库多选列表。 */
function KnowledgePicker({
  knowledgeBases,
  onToggle,
  selected,
}: {
  knowledgeBases: readonly { readonly id: string; readonly name: string }[];
  onToggle: (id: string) => void;
  selected: readonly string[];
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="text-sm font-medium">参考知识库（可多选）</legend>
      {knowledgeBases.length === 0 ? (
        <p className="m-0 text-xs text-muted-foreground">暂无可选知识库，可稍后在草稿中补充。</p>
      ) : (
        <div className="grid gap-1.5">
          {knowledgeBases.map((base) => (
            <label className="flex items-center gap-2 text-sm" key={base.id}>
              <input
                checked={selected.includes(base.id)}
                onChange={() => onToggle(base.id)}
                type="checkbox"
                value={base.id}
              />
              {base.name}
            </label>
          ))}
        </div>
      )}
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
