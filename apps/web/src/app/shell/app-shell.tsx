/** @fileoverview 按 shadcn 官方 dashboard 骨架组装持久工作区应用壳。 */

'use client';

import { SidebarInset, SidebarProvider, TooltipProvider } from '@everlearn/ui';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { AppSidebar } from './app-sidebar';
import { SiteHeader } from './site-header';
import { usePageTitleFocus, usePersistedLeftPanel } from './workspace-shell-state';

interface AppShellProps {
  children: ReactNode;
}

/** 用于在当前路由内容外渲染持久工作区框架。 */
export function AppShell({ children }: AppShellProps) {
  const [leftCollapsed, setLeftCollapsed] = usePersistedLeftPanel();
  usePageTitleFocus(usePathname());

  /** 用于把侧栏开合状态映射为持久化的折叠偏好。 */
  function handleSidebarOpenChange(open: boolean): void {
    setLeftCollapsed(!open);
  }

  return (
    <TooltipProvider>
      <a
        className="focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground sr-only"
        href="#main-content"
      >
        跳到主要内容
      </a>
      <SidebarProvider onOpenChange={handleSidebarOpenChange} open={!leftCollapsed}>
        <AppSidebar />
        <SidebarInset className="bg-background" id="main-content">
          <SiteHeader />
          <div className="@container/main flex flex-1 flex-col">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
