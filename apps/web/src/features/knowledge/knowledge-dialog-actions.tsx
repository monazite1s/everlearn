/** @fileoverview 渲染知识库对话框共享的取消与提交操作。 */

'use client';

import { Loader2Icon } from 'lucide-react';

import { Button, DialogFooter } from '@everlearn/ui';

/** 用于统一创建与编辑对话框的提交与取消行为。 */
export function KnowledgeDialogActions(props: {
  invalid: boolean;
  onCancel: () => void;
  submitLabel: string;
  submitting: boolean;
}) {
  const { invalid, onCancel, submitLabel, submitting } = props;
  return (
    <DialogFooter>
      <Button disabled={submitting} onClick={onCancel} type="button" variant="outline">
        取消
      </Button>
      <Button disabled={invalid || submitting} type="submit">
        {submitting && <Loader2Icon aria-hidden="true" className="animate-spin" />}
        {submitLabel}
      </Button>
    </DialogFooter>
  );
}
