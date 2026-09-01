/** @fileoverview 渲染应用顶栏：导航开关、面包屑与外观切换。 */

'use client';

import {
  Button,
  Separator,
  SidebarTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@everlearn/ui';
import { SearchIcon } from 'lucide-react';

import { PageBreadcrumb } from './page-breadcrumb';
import { GLOBAL_SEARCH_TRIGGER_ID, useSearchNavigation } from './search-navigation';

/** 用于渲染工作区顶栏并提供页面级操作入口。 */
export function SiteHeader() {
  const searchNavigation = useSearchNavigation();
  return (
    <header className="group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger aria-label="切换导航" />
        <Separator className="mr-2 h-4" orientation="vertical" />
        <PageBreadcrumb />
      </div>
      <div className="ml-auto flex items-center gap-2 px-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="全局搜索"
              id={GLOBAL_SEARCH_TRIGGER_ID}
              onClick={() => searchNavigation.openSearch(GLOBAL_SEARCH_TRIGGER_ID)}
              size="sm"
              type="button"
              variant="outline"
            >
              <SearchIcon aria-hidden="true" />
              <span className="hidden md:inline">搜索</span>
              <kbd className="hidden font-mono text-xs text-muted-foreground md:inline">⌘K</kbd>
            </Button>
          </TooltipTrigger>
          <TooltipContent>全局搜索</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
