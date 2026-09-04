/**
 * @fileoverview 渲染新建教程表单并处理创建提交。
 */

'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

import { ScopeFields } from './tutorial-scope-fields';
import { INITIAL_SCOPE_FORM, formToScopeInput } from './tutorial-scope-form';
import type { ScopeFormState } from './tutorial-scope-form';
import { createTutorial } from './tutorials-api';

interface TutorialCreateFormProps {
  knowledgeBases: readonly { readonly id: string; readonly name: string }[];
  onActionError: (message: string | undefined) => void;
  onCreated: () => void | Promise<void>;
}

/** 用于渲染新建教程表单。 */
export function TutorialCreateForm({
  knowledgeBases,
  onActionError,
  onCreated,
}: TutorialCreateFormProps) {
  const [form, setForm] = useState<ScopeFormState>(INITIAL_SCOPE_FORM);
  const [pending, setPending] = useState(false);

  /** 用于提交创建教程请求并刷新列表。 */
  const handleSubmit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (pending || form.topic.trim().length === 0) return;
    setPending(true);
    onActionError(undefined);
    const result = await createTutorial(formToScopeInput(form));
    setPending(false);
    if (!result.ok) {
      onActionError(result.error.message);
      return;
    }
    setForm(INITIAL_SCOPE_FORM);
    await onCreated();
  };

  return (
    <section aria-labelledby="tutorial-create-title" className="mb-4">
      <h2 className="m-0 text-title-small text-foreground" id="tutorial-create-title">
        新建教程
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        创建后进入草稿，确认范围将读取所选知识库并联网研究。
      </p>
      <div className="mt-2">
        <ScopeFields
          includeKnowledgePicker
          knowledgeBases={knowledgeBases}
          onChange={setForm}
          onSubmit={(event) => void handleSubmit(event)}
          pending={pending}
          submitLabel="创建教程"
          value={form}
        />
      </div>
    </section>
  );
}
