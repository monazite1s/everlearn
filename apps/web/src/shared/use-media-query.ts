/** @fileoverview 提供跨 feature 共享的媒体查询匹配订阅。 */

'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** 用于按媒体查询返回挂载后的稳定匹配结果。 */
export function useMediaQuery(query: string): boolean | undefined {
  const subscribe = useCallback(
    /** 用于订阅查询结果变化。 */
    function subscribeMatch(listener: () => void): () => void {
      const media = window.matchMedia(query);
      media.addEventListener('change', listener);
      return function stopSubscribing(): void {
        media.removeEventListener('change', listener);
      };
    },
    [query],
  );
  const getSnapshot = useCallback(
    /** 用于读取当前查询匹配。 */
    function readMatch(): boolean {
      return window.matchMedia(query).matches;
    },
    [query],
  );
  const getServerSnapshot = useCallback(
    /** 用于在服务端渲染期间保持未匹配。 */
    function readServerMatch(): undefined {
      return undefined;
    },
    [],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
