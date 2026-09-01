/** @fileoverview 在保存冲突期间拉取一次服务端最新内容投影。 */

'use client';

import { useEffect, useRef, useState } from 'react';

import type { DocumentContentDetail } from '@everlearn/contracts';

import { getDocumentContent } from './editor-api';

/** 冲突期间服务端最新投影的拉取状态。 */
export interface ConflictInfo {
  readonly detail?: DocumentContentDetail;
  readonly status: 'loading' | 'loaded' | 'failed';
}

/** 用于在冲突期间读取一次服务端最新版本时间。 */
export function useConflictDetail(documentId: string, active: boolean): ConflictInfo | undefined {
  const [info, setInfo] = useState<ConflictInfo | undefined>();
  const startedRef = useRef(false);
  useEffect(() => {
    if (!active || startedRef.current) return;
    startedRef.current = true;
    setInfo({ status: 'loading' });
    void getDocumentContent(documentId).then((result) => {
      setInfo(result.ok ? { detail: result.data, status: 'loaded' } : { status: 'failed' });
    });
  }, [active, documentId]);
  return info;
}
