/**
 * @fileoverview 管理教程详情的读取、异步期间轮询与手动重读。
 */

'use client';

import { useCallback, useEffect, useState } from 'react';

import { isPollingStatus } from './tutorials-status';
import { getTutorial } from './tutorials-api';
import type { TutorialApiErrorCode } from './tutorials-api';
import type { TutorialDetail } from './tutorials-contract';
import type { ApiResult } from '../../shared/api-request';

/** 详情读取失败的稳定投影，code 用于区分不可重试的不可访问态。 */
export interface TutorialLoadFailure {
  readonly code?: TutorialApiErrorCode;
  readonly message: string;
}

/** 用于持有教程详情数据、失败信息与刷新入口。 */
export function useTutorialDetail(id: string) {
  const [detail, setDetail] = useState<TutorialDetail | undefined>(undefined);
  const [loadError, setLoadError] = useState<TutorialLoadFailure | undefined>(undefined);
  const polling = detail !== undefined && isPollingStatus(detail.status);

  /** 用于重读教程详情并返回失败信息。 */
  const load = useCallback(async (): Promise<TutorialLoadFailure | undefined> => {
    const result = await getTutorial(id);
    return applyResult(result, setDetail, setLoadError);
  }, [id]);

  useEffect(
    /** 用于同步详情并在研究或生成期间按 5 秒轮询。 */
    function synchronizeDetail(): (() => void) | undefined {
      void getTutorial(id).then(
        /** 用于把一次读取结果安全写入状态。 */
        (result) => void applyResult(result, setDetail, setLoadError),
      );
      if (!polling) return undefined;
      const timer = setInterval(() => {
        void getTutorial(id).then(
          /** 用于把轮询读取结果安全写入状态。 */
          (result) => void applyResult(result, setDetail, setLoadError),
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

/** 用于把一次详情读取结果写入状态并回传失败信息。 */
function applyResult(
  result: ApiResult<TutorialDetail, TutorialApiErrorCode>,
  setDetail: (detail: TutorialDetail | undefined) => void,
  setLoadError: (failure: TutorialLoadFailure | undefined) => void,
): TutorialLoadFailure | undefined {
  if (result.ok) {
    setDetail(result.data);
    setLoadError(undefined);
    return undefined;
  }
  const failure: TutorialLoadFailure = {
    ...(result.error.code ? { code: result.error.code } : {}),
    message: result.error.message,
  };
  setLoadError(failure);
  return failure;
}
