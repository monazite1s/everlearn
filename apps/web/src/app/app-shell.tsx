/** @fileoverview Provides the persistent Mantine workspace shell and navigation behavior. */

'use client';

import { ActionIcon, AppShell as MantineAppShell, Button, Select, Tooltip } from '@mantine/core';
import {
  ActivityIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  SearchIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import styles from './app-shell.module.css';
import { appearanceOptions, themeOptions, useTheme } from './theme-provider';
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
  rightOpen: boolean;
  route: WorkspaceRoute;
  toggleRightPanel: () => void;
}

interface WorkspacePanelsProps extends AppShellProps {
  leftCollapsed: boolean;
  pathname: string;
  route: WorkspaceRoute;
  toggleLeftPanel: () => void;
}

const ICON_SIZE = 18;

/** Exposes compact theme controls backed by the single application theme store. */
function ThemeControls() {
  const theme = useTheme();
  /** Applies one validated semantic palette. */
  function handleThemeChange(value: string | null): void {
    theme.setTheme(value === 'neutral' ? 'neutral' : 'paper');
  }
  /** Applies one validated appearance preference. */
  function handleAppearanceChange(value: string | null): void {
    theme.setAppearance(value === 'dark' || value === 'light' ? value : 'system');
  }
  return (
    <div className={styles['theme-controls']}>
      <Select
        allowDeselect={false}
        aria-label="主题"
        data={themeOptions.map(({ id, label }) => ({ label, value: id }))}
        onChange={handleThemeChange}
        size="xs"
        value={theme.theme}
      />
      <Select
        allowDeselect={false}
        aria-label="外观"
        data={appearanceOptions.map(({ id, label }) => ({ label, value: id }))}
        onChange={handleAppearanceChange}
        size="xs"
        value={theme.appearance}
      />
    </div>
  );
}

/** Renders global location, search, creation, status, theme, and context actions. */
function Topbar({ pathname, rightOpen, route, toggleRightPanel }: TopbarProps) {
  const contextLabel = rightOpen ? '收起上下文' : '展开上下文';
  const ContextIcon = rightOpen ? PanelRightCloseIcon : PanelRightOpenIcon;
  return (
    <div className={styles.topbar}>
      <MobileNavigation pathname={pathname} />
      <Link className={styles.brand} href="/">
        Everlearn
      </Link>
      <span className={styles.location}>{route.label}</span>
      <div className={styles['top-actions']}>
        <Button
          component={Link}
          href="/knowledge?search=open"
          leftSection={<SearchIcon aria-hidden="true" size={ICON_SIZE} />}
          variant="subtle"
        >
          搜索
        </Button>
        <CreationAction route={route} />
        <Button
          component={Link}
          href={`${route.href}?view=runs`}
          leftSection={<ActivityIcon aria-hidden="true" size={ICON_SIZE} />}
          variant="subtle"
        >
          运行中 2
        </Button>
        <div className={styles['desktop-controls']}>
          <ThemeControls />
          <Tooltip label={contextLabel}>
            <ActionIcon
              aria-controls="context-panel"
              aria-expanded={rightOpen}
              aria-label={contextLabel}
              onClick={toggleRightPanel}
              size="lg"
              variant="subtle"
            >
              <ContextIcon aria-hidden="true" size={ICON_SIZE} />
            </ActionIcon>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

/** Arranges the current page between persistent navigation and contextual information. */
function WorkspacePanels(props: WorkspacePanelsProps) {
  const { children, leftCollapsed, pathname, route, toggleLeftPanel } = props;
  const CollapseIcon = leftCollapsed ? PanelLeftOpenIcon : PanelLeftCloseIcon;
  const collapseLabel = leftCollapsed ? '展开导航' : '收起导航';
  return (
    <>
      <MantineAppShell.Navbar aria-label="工作区导航" className={styles.navbar} component="aside">
        <div className={styles['navbar-header']}>
          <Tooltip label={collapseLabel} position="right">
            <ActionIcon
              aria-controls="primary-navigation"
              aria-expanded={!leftCollapsed}
              aria-label={collapseLabel}
              onClick={toggleLeftPanel}
              size="lg"
              variant="subtle"
            >
              <CollapseIcon aria-hidden="true" size={ICON_SIZE} />
            </ActionIcon>
          </Tooltip>
        </div>
        <PrimaryNavigation
          collapsed={leftCollapsed}
          navigationId="primary-navigation"
          pathname={pathname}
        />
      </MantineAppShell.Navbar>
      <MantineAppShell.Main className={styles.main} id="main-content">
        {children}
      </MantineAppShell.Main>
      <MantineAppShell.Aside aria-label="当前上下文" className={styles.aside} id="context-panel">
        <p className={styles['context-label']}>当前上下文</p>
        <h2>{route.label}</h2>
        <p>{route.context}</p>
      </MantineAppShell.Aside>
    </>
  );
}

/** Renders the persistent workspace chrome around the current route content. */
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
          <Topbar
            pathname={pathname}
            rightOpen={rightOpen}
            route={route}
            toggleRightPanel={toggleRightPanel}
          />
        </MantineAppShell.Header>
        <WorkspacePanels
          leftCollapsed={leftCollapsed}
          pathname={pathname}
          route={route}
          toggleLeftPanel={toggleLeftPanel}
        >
          {children}
        </WorkspacePanels>
      </MantineAppShell>
    </Tooltip.Group>
  );
}
