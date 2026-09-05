/**
 * @fileoverview 管理条目详情与「处理过程」运行详情的按需读取。
 */

'use client';

import { useEffect, useState } from 'react';

import { getDigestRun, getNewsItem } from './news-api';
import type { NewsItemDetail, NewsRunDetail } from './news-api';

/** 详情读取状态；unavailable 表示统一不可访问且不提供重试。 */
type DetailStatus = 'failed' | 'idle' | 'loading' | 'ready' | 'unavailable';

/** 条目详情 Hook 的消费接口。 */
export interface ItemDetailState {
  readonly detail?: NewsItemDetail | undefined;
  readonly message?: string | undefined;
  readonly retry: () => void;
  readonly status: DetailStatus;
}

/** 用于按条目深链读取详情并在 404 时归一为不可访问。 */
export function useNewsItemDetail(itemId: string | undefined): ItemDetailState {
  const [status, setStatus] = useState<DetailStatus>('idle');
  const [detail, setDetail] = useState<NewsItemDetail | undefined>(undefined);
  const [message, setMessage] = useState<string | undefined>(undefined);
  const [attempt, setAttempt] = useState(0);

  useEffect(
    /** 用于在条目变化时读取详情并丢弃过期响应。 */
    function synchronizeDetail(): () => void {
      const controller = new AbortController();
      const detailTimer = setTimeout(() => {
        if (itemId === undefined || controller.signal.aborted) return;
        setStatus('loading');
        void getNewsItem(itemId, controller.signal).then(
          /** 用于按结果写入就绪、失败或不可访问状态。 */
          function applyDetail(result): void {
            if (controller.signal.aborted) return;
            if (result.ok) {
              setDetail(result.data);
              setStatus('ready');
              return;
            }
            setDetail(undefined);
            setStatus(result.error.code === 'NOT_FOUND' ? 'unavailable' : 'failed');
            setMessage(result.error.message);
          },
        );
      }, 0);
      return /** 用于取消卸载或切换条目前的在途请求。 */ function cancel(): void {
        clearTimeout(detailTimer);
        controller.abort();
      };
    },
    [itemId, attempt],
  );

  const retry = /** 用于详情失败后就地重读。 */ function retryDetail(): void {
    setAttempt((current) => current + 1);
  };

  return { detail, message, retry, status };
}

/** 运行详情读取状态。 */
interface RunLoadState {
  readonly message?: string | undefined;
  readonly run?: NewsRunDetail | undefined;
  readonly status: 'failed' | 'idle' | 'loading' | 'ready';
}

/** 用于在「处理过程」首次展开时按需读取运行详情。 */
export function useNewsRunDetail(
  enabled: boolean,
  runId: string | undefined,
): RunLoadState & { retry: () => void } {
  const [state, setState] = useState<RunLoadState>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);

  useEffect(
    /** 用于仅在展开且有运行 ID 时读取一次详情。 */
    function synchronizeRun(): () => void {
      const controller = new AbortController();
      const runTimer = setTimeout(() => {
        if (!enabled || runId === undefined || controller.signal.aborted) return;
        setState({ status: 'loading' });
        void getDigestRun(runId, controller.signal).then(
          /** 用于按结果写入运行详情或失败状态。 */
          function applyRun(result): void {
            if (controller.signal.aborted) return;
            if (result.ok) {
              setState({ run: result.data, status: 'ready' });
              return;
            }
            setState({ message: result.error.message, status: 'failed' });
          },
        );
      }, 0);
      return /** 用于取消卸载前的在途请求。 */ function cancel(): void {
        clearTimeout(runTimer);
        controller.abort();
      };
    },
    [enabled, runId, attempt],
  );

  const retry = /** 用于运行详情失败后就地重读。 */ function retryRun(): void {
    setAttempt((current) => current + 1);
  };

  return { ...state, retry };
}
