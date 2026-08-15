/** @fileoverview 渲染工作区一级导航菜单。 */

'use client';

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@everlearn/ui';
import {
  GraduationCapIcon,
  HomeIcon,
  LibraryBigIcon,
  RssIcon,
  SettingsIcon,
  WorkflowIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { isWorkspaceRouteCurrent, workspaceRoutes } from './workspace-routes';
import type { WorkspaceRoute, WorkspaceRouteId } from './workspace-routes';

const routeIcons: Readonly<Record<WorkspaceRouteId, LucideIcon>> = {
  home: HomeIcon,
  knowledge: LibraryBigIcon,
  news: RssIcon,
  settings: SettingsIcon,
  tutorials: GraduationCapIcon,
  workflows: WorkflowIcon,
};

/** 用于渲染带图标、当前态与折叠提示的一级导航组。 */
export function NavMain() {
  const pathname = usePathname();

  /** 用于把单个入口渲染为菜单链接。 */
  function renderRoute(route: WorkspaceRoute) {
    const current = isWorkspaceRouteCurrent(pathname, route);
    const RouteIcon = routeIcons[route.id];
    return (
      <SidebarMenuItem key={route.id}>
        <SidebarMenuButton
          aria-current={current ? 'page' : undefined}
          asChild
          isActive={current}
          tooltip={route.label}
        >
          <Link href={route.href}>
            <RouteIcon aria-hidden="true" />
            <span>{route.label}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>工作区</SidebarGroupLabel>
      <SidebarMenu>{workspaceRoutes.map(renderRoute)}</SidebarMenu>
    </SidebarGroup>
  );
}
