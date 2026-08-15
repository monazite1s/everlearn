/** @fileoverview 渲染应用顶栏：导航开关、面包屑与外观切换。 */

'use client';

import { Separator, SidebarTrigger } from '@everlearn/ui';

import { PageBreadcrumb } from './page-breadcrumb';

/** 用于渲染工作区顶栏并提供页面级操作入口。 */
export function SiteHeader() {
  return (
    <header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger aria-label="切换导航" />
        <Separator className="mr-2 h-4" orientation="vertical" />
        <PageBreadcrumb />
      </div>
      <div className="ml-auto flex items-center gap-2 px-4" />
    </header>
  );
}
