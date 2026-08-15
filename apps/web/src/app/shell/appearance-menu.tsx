/** @fileoverview 在侧栏底部提供外观（跟随系统/浅色/深色）切换菜单。 */

'use client';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@everlearn/ui';
import { ChevronUpIcon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { appearanceOptions, useTheme } from '../theme-provider';
import type { Appearance } from '../theme-provider';

const optionIcons: Readonly<Record<Appearance, LucideIcon>> = {
  dark: MoonIcon,
  light: SunIcon,
  system: MonitorIcon,
};

/** 用于渲染官方惯用法的外观切换下拉菜单。 */
export function AppearanceMenu() {
  const { isMobile } = useSidebar();
  const { appearance, colorMode, setAppearance } = useTheme();
  const currentLabel =
    appearanceOptions.find((option) => option.id === appearance)?.label ?? '跟随系统';
  const TriggerIcon = colorMode === 'dark' ? MoonIcon : SunIcon;

  /** 用于把用户选择的外观写入主题状态。 */
  function changeAppearance(next: string): void {
    setAppearance(next as Appearance);
  }

  /** 用于渲染带图标的外观选项。 */
  function renderOption(option: (typeof appearanceOptions)[number]) {
    const OptionIcon = optionIcons[option.id];
    return (
      <DropdownMenuRadioItem key={option.id} value={option.id}>
        <OptionIcon aria-hidden="true" />
        {option.label}
      </DropdownMenuRadioItem>
    );
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton aria-label="外观设置" size="lg">
              <TriggerIcon aria-hidden="true" />
              <span>{currentLabel}</span>
              <ChevronUpIcon aria-hidden="true" className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48" side={isMobile ? 'bottom' : 'top'}>
            <DropdownMenuRadioGroup onValueChange={changeAppearance} value={appearance}>
              {appearanceOptions.map(renderOption)}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
