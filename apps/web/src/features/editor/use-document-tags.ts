/** @fileoverview 管理当前文档标签的加载与整体设置状态。 */

'use client';

import { useCallback, useEffect, useState } from 'react';

import { getDocumentTags, setDocumentTags } from './document-tags-api';

/** 标签状态管理所需的参数。 */
interface UseDocumentTagsProps {
  readonly documentId: string;
}

/** 用于持有标签名列表、失败标注与整体设置回调。 */
export function useDocumentTags(props: UseDocumentTagsProps) {
  const [tags, setTags] = useState<readonly string[]>([]);
  const [failed, setFailed] = useState(false);

  /** 用于以整体设置语义提交标签名列表并同步本地状态。 */
  const applyNames = useCallback(
    async (names: readonly string[]) => {
      const result = await setDocumentTags(props.documentId, names);
      if (result.ok) setTags(result.data.items.map((tag) => tag.name));
      setFailed(!result.ok);
    },
    [props.documentId],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getDocumentTags(props.documentId);
      if (cancelled) return;
      if (result.ok) setTags(result.data.items.map((tag) => tag.name));
      setFailed(!result.ok);
    })();
    return () => {
      cancelled = true;
    };
  }, [props.documentId]);

  return { applyNames, failed, tags };
}
