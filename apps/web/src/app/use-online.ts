/** @fileoverview 提供跨 feature 共享的浏览器网络状态订阅。 */

'use client';

import { useSyncExternalStore } from 'react';

/** 用于订阅浏览器在线和离线变化。 */
function subscribeOnline(callback: () => void): () => void {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return function unsubscribe(): void {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

/** 用于返回当前浏览器网络状态。 */
function getOnlineSnapshot(): boolean {
  return navigator.onLine;
}

/** 用于在浏览器水合前保持服务端渲染确定。 */
function getServerOnlineSnapshot(): boolean {
  return true;
}

/** 用于返回浏览器在线状态。 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);
}
