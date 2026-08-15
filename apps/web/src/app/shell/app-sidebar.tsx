/** @fileoverview 提供官方 dashboard 骨架的左栏结构：品牌、导航与外观菜单。 */

'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@everlearn/ui';
import { BookOpenIcon } from 'lucide-react';
import Link from 'next/link';

import { AppearanceMenu } from './appearance-menu';
import { NavMain } from './nav-main';

/** 用于渲染可折叠为图标列的内嵌式工作区侧栏。 */
export function AppSidebar() {
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" tooltip="Everlearn">
              <Link href="/">
                <BookOpenIcon aria-hidden="true" />
                <span className="font-serif text-title-small">Everlearn</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain />
      </SidebarContent>
      <SidebarFooter>
        <AppearanceMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
