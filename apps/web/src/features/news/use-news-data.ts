/**
 * @fileoverview 管理订阅列表的首次读取、失败重试与过期响应隔离。
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

import { listSubscriptions } from './news-subscriptions-api';
import type { NewsSubscription } from './news-subscriptions-api';

/** 订阅列表读取状态。 */
export interface SubscriptionsState {
  readonly items: NewsSubscription[];
  readonly message?: string;
  readonly status: 'failed' | 'loading' | 'ready';
}

const INITIAL_STATE: SubscriptionsState = { items: [], status: 'loading' };

/** 用于把一次订阅读取结果写入状态。 */
function applyResult(
  result: Awaited<ReturnType<typeof listSubscriptions>>,
): (current: SubscriptionsState) => SubscriptionsState {
  return /** 用于按成功或失败投影下一状态。 */ (current) =>
    result.ok
      ? { items: result.data, status: 'ready' }
      : { ...current, message: result.error.message, status: 'failed' };
}

/** 用于持有订阅列表状态并提供就地重试。 */
export function useNewsSubscriptions(): {
  readonly reload: () => void;
  readonly state: SubscriptionsState;
} {
  const [state, setState] = useState<SubscriptionsState>(INITIAL_STATE);
  const [attempt, setAttempt] = useState(0);

  useEffect(
    /** 用于读取订阅列表并丢弃卸载后到达的响应。 */
    function synchronizeSubscriptions(): () => void {
      const controller = new AbortController();
      void listSubscriptions(controller.signal).then(
        /** 用于把请求结果写入就绪或失败状态。 */
        function apply(result): void {
          if (!controller.signal.aborted) setState(applyResult(result));
        },
      );
      return /** 用于取消卸载后仍未完成的请求。 */ function cancel(): void {
        controller.abort();
      };
    },
    [attempt],
  );

  const reload = /** 用于失败后就地重读订阅列表并回到加载态。 */ useCallback(
    function retrySubscriptions(): void {
      setState((current) => ({ ...current, status: 'loading' }));
      setAttempt((current) => current + 1);
    },
    [],
  );

  return { reload, state };
}
