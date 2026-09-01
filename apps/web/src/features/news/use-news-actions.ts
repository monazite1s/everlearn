/**
 * @fileoverview 管理资讯页创建订阅与立即运行动作的提交中与错误状态。
 */

'use client';

import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';

import { createSubscription, runSubscription } from './news-api';
import { toCreatePayload } from './news-subscription-form';
import type { NewsFormState } from './news-subscription-form';

/** 用于持有资讯动作的执行入口与状态。 */
export function useNewsActions(load: () => Promise<string | undefined>) {
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | undefined>(undefined);

  /** 用于提交新建订阅表单。 */
  const handleCreate = useCallback(
    async (event: FormEvent, form: NewsFormState): Promise<void> => {
      event.preventDefault();
      if (pending || form.name.trim().length === 0 || form.feedUrl.trim().length === 0) return;
      setPending(true);
      setActionError(undefined);
      const result = await createSubscription(toCreatePayload(form));
      setPending(false);
      if (!result.ok) {
        setActionError(result.error.message);
        return;
      }
      await load();
    },
    [load, pending],
  );

  /** 用于立即触发一次订阅简报。 */
  const handleRun = useCallback(
    async (subscriptionId: string): Promise<void> => {
      setPending(true);
      setActionError(undefined);
      const result = await runSubscription(subscriptionId);
      setPending(false);
      if (!result.ok) {
        setActionError(result.error.message);
        return;
      }
      await load();
    },
    [load],
  );

  return { actionError, handleCreate, handleRun, pending };
}
