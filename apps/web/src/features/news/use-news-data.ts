/**
 * @fileoverview 管理资讯订阅与简报的初始同步及手动重读。
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

import { listDigestRuns, listSubscriptions } from './news-api';
import type { NewsDigestRunItem, NewsSubscriptionItem } from './news-api';

/** 一次订阅与简报读取的结果。 */
interface NewsOverview {
  readonly errorMessage?: string;
  readonly items?: NewsSubscriptionItem[];
  readonly runs?: NewsDigestRunItem[];
}

/** 用于读取订阅列表与最近简报。 */
async function fetchOverview(): Promise<NewsOverview> {
  const result = await listSubscriptions();
  if (!result.ok) return { errorMessage: result.error.message };
  const runsResult = await listDigestRuns();
  return {
    items: result.data,
    runs: runsResult.ok ? runsResult.data : [],
  };
}

/** 用于持有资讯页数据与刷新入口。 */
export function useNewsData() {
  const [items, setItems] = useState<NewsSubscriptionItem[] | undefined>(undefined);
  const [runs, setRuns] = useState<NewsDigestRunItem[]>([]);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);

  /** 用于把一次读取结果写入本地状态。 */
  const apply = useCallback((overview: NewsOverview): string | undefined => {
    if (overview.items !== undefined) setItems(overview.items);
    if (overview.runs !== undefined) setRuns(overview.runs);
    return overview.errorMessage;
  }, []);

  /** 用于手动重读订阅与最近简报并返回失败文案。 */
  const load = useCallback(
    async (): Promise<string | undefined> => apply(await fetchOverview()),
    [apply],
  );

  useEffect(
    /** 用于启动并取消初始列表同步。 */
    function synchronizeInitialList(): () => void {
      let active = true;
      void fetchOverview().then(
        /** 用于把过期响应安全地写入初始状态。 */
        function applyIfActive(overview): void {
          if (!active) return;
          if (overview.items !== undefined) setItems(overview.items);
          if (overview.runs !== undefined) setRuns(overview.runs);
          if (overview.errorMessage !== undefined) setLoadError(overview.errorMessage);
        },
      );
      return /** 用于忽略组件卸载后到达的过期响应。 */ function cancel(): void {
        active = false;
      };
    },
    [],
  );

  return { items, load, loadError, runs };
}
