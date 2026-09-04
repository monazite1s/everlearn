/**
 * @fileoverview 渲染草稿教程的范围编辑与确认研究入口。
 */

'use client';

import { useState } from 'react';

import { ScopeFields } from './tutorial-scope-fields';
import { formToScopeInput, scopeToForm } from './tutorial-scope-form';
import type { ScopeFormState } from './tutorial-scope-form';
import { confirmTutorialScope, updateTutorialScope } from './tutorials-api';
import type { CreateTutorialInput, TutorialDetail, TutorialScope } from './tutorials-api';

/** 用于依次保存范围并确认研究，失败时返回错误文案。 */
async function saveScopeAndConfirm(
  tutorialId: string,
  input: CreateTutorialInput,
): Promise<string | undefined> {
  const saved = await updateTutorialScope(tutorialId, input);
  if (!saved.ok) return saved.error.message;
  const confirmed = await confirmTutorialScope(tutorialId);
  if (!confirmed.ok) return confirmed.error.message;
  return undefined;
}

/** 范围缺失时的兜底空范围。 */
const EMPTY_SCOPE: TutorialScope = {
  audience: '',
  depth: 'standard',
  excludeTopics: [],
  goals: '',
  includeTopics: [],
  knowledgeBaseIds: [],
  level: '',
  topic: '',
};

/** 用于渲染草稿状态的范围编辑。 */
export function TutorialDraftPanel({
  detail,
  onActionError,
  onReload,
}: {
  detail: TutorialDetail;
  onActionError: (message: string | undefined) => void;
  onReload: () => void;
}) {
  const [form, setForm] = useState<ScopeFormState>(() => scopeToForm(detail.scope ?? EMPTY_SCOPE));
  const [pending, setPending] = useState(false);

  /** 用于保存范围并确认开始研究。 */
  const handleConfirm = async (event: { preventDefault: () => void }): Promise<void> => {
    event.preventDefault();
    if (pending || form.topic.trim().length === 0) return;
    setPending(true);
    onActionError(undefined);
    const failure = await saveScopeAndConfirm(detail.id, formToScopeInput(form));
    setPending(false);
    if (failure !== undefined) {
      onActionError(failure);
      return;
    }
    onReload();
  };

  return (
    <div className="grid gap-2">
      <p className="m-0 text-xs text-muted-foreground">
        确认后将读取所选知识库并联网研究，用于生成大纲。
      </p>
      <ScopeFields
        includeKnowledgePicker={false}
        knowledgeBases={[]}
        onChange={setForm}
        onSubmit={(event) => void handleConfirm(event)}
        pending={pending}
        submitLabel="确认并开始研究"
        value={form}
      />
    </div>
  );
}
