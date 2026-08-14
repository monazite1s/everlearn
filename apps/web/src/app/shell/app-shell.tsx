/** @fileoverview 提供持久 Mantine 工作区外壳和导航行为。 */

'use client';

import { ActionIcon, AppShell as MantineAppShell, Button, Menu, Tooltip } from '@mantine/core';
import {
  CheckIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  PaletteIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import styles from './app-shell.module.css';
import { appearanceOptions, themeOptions, useTheme } from '../theme-provider';
import { CreationAction, MobileNavigation, PrimaryNavigation } from './workspace-navigation';
import { getWorkspaceRoute } from './workspace-routes';
import type { WorkspaceRoute } from './workspace-routes';
import {
  usePageTitleFocus,
  usePersistedLeftPanel,
  useRouteContextPanel,
} from './workspace-shell-state';

interface AppShellProps {
  children: ReactNode;
}

interface TopbarProps {
  pathname: string;
  route: WorkspaceRoute;
}

interface WorkspacePanelsProps extends AppShellProps {
  leftCollapsed: boolean;
  pathname: string;
  rightOpen: boolean;
  route: WorkspaceRoute;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
}

const ICON_SIZE = 18;

/** 用于渲染外观与主题设置菜单。 */
function ThemeMenu() {
  const theme = useTheme();
  /** 用于标记菜单项当前值。 */
  function renderCheck(active: boolean) {
    return active ? <CheckIcon aria-hidden="true" size={14} /> : undefined;
  }
  return (
    <Menu shadow="md" width={200} withinPortal>
      <Menu.Target>
        <ActionIcon aria-label="外观与主题" size="lg" variant="subtle">
          <PaletteIcon aria-hidden="true" size={ICON_SIZE} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>外观</Menu.Label>
        {appearanceOptions.map(({ id, label }) => (
          <Menu.Item
            key={id}
            leftSection={renderCheck(theme.appearance === id)}
            onClick={() => theme.setAppearance(id)}
          >
            {label}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Label>主题</Menu.Label>
        {themeOptions.map(({ id, label }) => (
          <Menu.Item
            key={id}
            leftSection={renderCheck(theme.theme === id)}
            onClick={() => theme.setTheme(id)}
          >
            {label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}

/** 用于渲染全局位置、创建和外观操作。 */
function Topbar({ pathname, route }: TopbarProps) {
  return (
    <div className={styles.topbar}>
      <MobileNavigation pathname={pathname} />
      <Link className={styles.brand} href="/">
        Everlearn
      </Link>
      <span className={styles.location}>{route.label}</span>
      <div className={styles['top-actions']}>
        <CreationAction route={route} />
        <div className={styles['desktop-controls']}>
          <ThemeMenu />
        </div>
      </div>
    </div>
  );
}

/** 用于渲染侧栏底部的收起入口。 */
function SidebarFooter({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const label = collapsed ? '展开导航' : '收起导航';
  const CollapseIcon = collapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;
  return (
    <div className={styles['navbar-footer']}>
      <Button
        aria-controls="primary-navigation"
        aria-expanded={!collapsed}
        leftSection={<CollapseIcon aria-hidden="true" size={16} />}
        onClick={onToggle}
        size="compact-sm"
        variant="subtle"
      >
        {label}
      </Button>
    </div>
  );
}

/** 用于在右栏收起时提供贴边展开把手。 */
function ContextReopenTab({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      aria-label="展开上下文"
      className={styles['context-tab']}
      onClick={onOpen}
      type="button"
    >
      <PanelRightOpenIcon aria-hidden="true" size={16} />
    </button>
  );
}

/** 用于在持久导航和上下文信息之间排列当前页面。 */
function WorkspacePanels(props: WorkspacePanelsProps) {
  const { children, leftCollapsed, pathname, rightOpen, route, toggleLeftPanel, toggleRightPanel } =
    props;
  return (
    <>
      <MantineAppShell.Navbar aria-label="工作区导航" className={styles.navbar} component="aside">
        <PrimaryNavigation
          collapsed={leftCollapsed}
          navigationId="primary-navigation"
          pathname={pathname}
        />
        <SidebarFooter collapsed={leftCollapsed} onToggle={toggleLeftPanel} />
      </MantineAppShell.Navbar>
      <MantineAppShell.Main className={styles.main} id="main-content">
        {children}
        {!rightOpen && <ContextReopenTab onOpen={toggleRightPanel} />}
      </MantineAppShell.Main>
      <MantineAppShell.Aside aria-label="当前上下文" className={styles.aside} id="context-panel">
        <div className={styles['aside-header']}>
          <p className={styles['context-label']}>当前上下文</p>
          <Tooltip label="收起上下文">
            <ActionIcon
              aria-controls="context-panel"
              aria-expanded
              aria-label="收起上下文"
              onClick={toggleRightPanel}
              size="lg"
              variant="subtle"
            >
              <PanelRightCloseIcon aria-hidden="true" size={ICON_SIZE} />
            </ActionIcon>
          </Tooltip>
        </div>
        <h2 className={styles['aside-title']}>{route.label}</h2>
        <p className={styles['aside-description']}>{route.context}</p>
      </MantineAppShell.Aside>
    </>
  );
}

/** 用于在当前路由内容外渲染持久工作区框架。 */
export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const route = getWorkspaceRoute(pathname);
  const [leftCollapsed, toggleLeftPanel] = usePersistedLeftPanel();
  const [rightOpen, toggleRightPanel] = useRouteContextPanel(pathname);
  usePageTitleFocus(pathname);
  return (
    <Tooltip.Group closeDelay={100} openDelay={200}>
      <a className={styles['skip-link']} href="#main-content">
        跳到主要内容
      </a>
      <MantineAppShell
        aside={{
          breakpoint: '80em',
          collapsed: { desktop: !rightOpen, mobile: true },
          width: 320,
        }}
        className={styles.shell}
        data-left-collapsed={leftCollapsed}
        header={{ height: 48 }}
        navbar={{
          breakpoint: '48em',
          collapsed: { mobile: true },
          width: leftCollapsed ? 56 : 264,
        }}
        padding={0}
        withBorder={false}
      >
        <MantineAppShell.Header className={styles.header}>
          <Topbar pathname={pathname} route={route} />
        </MantineAppShell.Header>
        <WorkspacePanels
          leftCollapsed={leftCollapsed}
          pathname={pathname}
          rightOpen={rightOpen}
          route={route}
          toggleLeftPanel={toggleLeftPanel}
          toggleRightPanel={toggleRightPanel}
        >
          {children}
        </WorkspacePanels>
      </MantineAppShell>
    </Tooltip.Group>
  );
}
