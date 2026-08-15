/** @fileoverview 管理工作区焦点和浏览器持久化的左栏折叠状态。 */

'use client';

import { useEffect, useState } from 'react';

const LEFT_PANEL_KEY = 'everlearn-left-panel-collapsed';

/** 用于在客户端路由切换后聚焦新页面标题。 */
export function usePageTitleFocus(pathname: string): void {
  useEffect(
    /** 用于将键盘和读屏上下文移到唯一页面标题。 */
    function focusPageTitle(): void {
      document.querySelector<HTMLElement>('[data-page-title]')?.focus();
    },
    [pathname],
  );
}

/** 用于恢复并保存当前设备的左侧导航折叠偏好。 */
export function usePersistedLeftPanel(): [boolean, (next: boolean) => void] {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(
    /** 用于在水合界面稳定后再执行浏览器持久化。 */
    function scheduleLeftPanelLoad(): () => void {
      /** 用于加载有效本地偏好且不阻塞水合。 */
      function loadLeftPanel(): void {
        setCollapsed(localStorage.getItem(LEFT_PANEL_KEY) === 'true');
      }
      const timer = window.setTimeout(loadLeftPanel, 0);
      /** 用于在应用壳卸载时取消过期持久化任务。 */
      function cancelLeftPanelLoad(): void {
        window.clearTimeout(timer);
      }
      return cancelLeftPanelLoad;
    },
    [],
  );

  /** 用于写入并持久化新的左侧导航折叠状态。 */
  function persistLeftPanel(next: boolean): void {
    setCollapsed(next);
    localStorage.setItem(LEFT_PANEL_KEY, String(next));
  }
  return [collapsed, persistLeftPanel];
}
