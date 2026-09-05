/**
 * @fileoverview 管理订阅创建、更新、启停与立即运行的提交状态。
 */

'use client';

import { useCallback, useState } from 'react';

import { createSubscription, runSubscription, updateSubscription } from './news-subscriptions-api';
import type { NewsSubscriptionPayload } from './news-subscriptions-api';

type SubscriptionOutcome = Awaited<ReturnType<typeof createSubscription>>;

/** 动作收尾时写入的状态补丁。 */
interface FinishPatch {
  error?: string;
  pending: boolean;
}

/** 用于提交一个订阅动作并统一管理提交中与错误状态。 */
async function submitAction(
  outcome: () => Promise<SubscriptionOutcome>,
  finish: (patch: FinishPatch) => void,
): Promise<boolean> {
  finish({ pending: true });
  const result = await outcome();
  finish({ pending: false, ...(result.ok ? {} : { error: result.error.message }) });
  return result.ok;
}

/** 用于持有订阅动作的执行入口与状态。 */
export function useNewsActions(reload: () => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  /** 用于在一次动作收尾时写入提交与错误状态。 */
  const finish = useCallback((patch: FinishPatch): void => {
    setPending(patch.pending);
    setError(patch.pending ? undefined : patch.error);
  }, []);

  const create = /** 用于提交创建订阅并在成功后重读列表。 */ useCallback(
    async function submitCreate(payload: NewsSubscriptionPayload): Promise<boolean> {
      const success = await submitAction(() => createSubscription(payload), finish);
      if (success) reload();
      return success;
    },
    [finish, reload],
  );

  const update = /** 用于提交更新订阅（含启停）并在成功后重读列表。 */ useCallback(
    async function submitUpdate(
      subscriptionId: string,
      payload: NewsSubscriptionPayload,
      version: number,
    ): Promise<boolean> {
      const success = await submitAction(
        () => updateSubscription(subscriptionId, payload, version),
        finish,
      );
      if (success) reload();
      return success;
    },
    [finish, reload],
  );

  const run = /** 用于立即运行一次订阅采集。 */ useCallback(
    async function submitRun(subscriptionId: string): Promise<void> {
      await submitAction(() => runSubscription(subscriptionId), finish);
    },
    [finish],
  );

  const clearError = /** 用于关闭错误提示。 */ useCallback(function dismissError(): void {
    setError(undefined);
  }, []);

  return { clearError, create, error, pending, run, update };
}
