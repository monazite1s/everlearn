/** @fileoverview 管理工作区焦点和浏览器持久化面板状态。 */

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

/** 用于恢复并保存当前设备的左侧面板偏好。 */
export function usePersistedLeftPanel(): [boolean, () => void] {
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

  /** 用于切换并保存当前浏览器的左侧面板。 */
  function toggleLeftPanel(): void {
    setCollapsed(
      /** 用于保存由当前面板状态派生的新状态。 */
      function persistNextState(current): boolean {
        const next = !current;
        localStorage.setItem(LEFT_PANEL_KEY, String(next));
        return next;
      },
    );
  }
  return [collapsed, toggleLeftPanel];
}

/** 用于按路由跟踪当前会话的右侧上下文面板。 */
export function useRouteContextPanel(pathname: string): [boolean, () => void] {
  const [open, setOpen] = useState(true);
  useEffect(
    /** 用于在水合界面稳定后再恢复路由状态。 */
    function scheduleRightPanelLoad(): () => void {
      /** 用于恢复已存选择或应用桌面默认值。 */
      function loadRightPanel(): void {
        const stored = sessionStorage.getItem(`everlearn-right-panel:${pathname}`);
        const desktop =
          typeof window.matchMedia === 'function'
            ? window.matchMedia('(width > 1280px)').matches
            : window.innerWidth > 1280;
        setOpen(stored === null ? desktop : stored === 'true');
      }
      const timer = window.setTimeout(loadRightPanel, 0);
      /** 用于在快速导航时取消过期恢复任务。 */
      function cancelRightPanelLoad(): void {
        window.clearTimeout(timer);
      }
      return cancelRightPanelLoad;
    },
    [pathname],
  );

  /** 用于切换当前路由上下文且不泄漏到其他页面。 */
  function toggleRightPanel(): void {
    setOpen(
      /** 用于保存当前路由的新上下文状态。 */
      function persistNextState(current): boolean {
        const next = !current;
        sessionStorage.setItem(`everlearn-right-panel:${pathname}`, String(next));
        return next;
      },
    );
  }
  return [open, toggleRightPanel];
}
