/**
 * @fileoverview 管理教程详情的读取、5 秒轮询与手动重读。
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

import { isPollingStatus } from './tutorials-status';
import { getTutorial } from './tutorials-api';
import type { TutorialApiErrorCode, TutorialDetail } from './tutorials-api';
import type { ApiResult } from '../../shared/api-request';

/** 用于持有教程详情数据、失败文案与刷新入口。 */
export function useTutorialDetail(id: string) {
  const [detail, setDetail] = useState<TutorialDetail | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | undefined>(undefined);
  const polling = detail !== undefined && isPollingStatus(detail.status);

  /** 用于重读教程详情并返回失败文案。 */
  const load = useCallback(async (): Promise<string | undefined> => {
    const result = await getTutorial(id);
    if (!result.ok) {
      setLoadError(result.error.message);
      return result.error.message;
    }
    setDetail(result.data);
    setLoadError(undefined);
    return undefined;
  }, [id]);

  useEffect(
    /** 用于启动详情同步并在研究或生成期间按 5 秒轮询。 */
    function synchronizeDetail(): (() => void) | undefined {
      void getTutorial(id).then(
        /** 用于把一次读取结果安全写入状态。 */
        function apply(result: ApiResult<TutorialDetail, TutorialApiErrorCode>): void {
          applyResult(result, setDetail, setLoadError);
        },
      );
      if (!polling) return undefined;
      const timer = setInterval(() => {
        void getTutorial(id).then(
          /** 用于把轮询读取结果安全写入状态。 */
          function apply(result: ApiResult<TutorialDetail, TutorialApiErrorCode>): void {
            applyResult(result, setDetail, setLoadError);
          },
        );
      }, 5000);
      return /** 用于停止轮询。 */ function cancel(): void {
        clearInterval(timer);
      };
    },
    [id, polling],
  );

  return { detail, load, loadError };
}

/** 用于把一次详情读取结果安全写入状态。 */
function applyResult(
  result: ApiResult<TutorialDetail, TutorialApiErrorCode>,
  setDetail: (detail: TutorialDetail | undefined) => void,
  setLoadError: (message: string | undefined) => void,
): void {
  if (result.ok) {
    setDetail(result.data);
    setLoadError(undefined);
  } else {
    setLoadError(result.error.message);
  }
}
