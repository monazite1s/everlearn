/** @fileoverview Provides the persistent desktop workspace shell and navigation behavior. */

'use client';

import { Button, Tooltip, TooltipProvider } from '@everlearn/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ChangeEvent, ReactNode } from 'react';

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

/** Exposes compact persisted theme controls without leaking palette values. */
function ThemeControls() {
  const theme = useTheme();
  /** Applies one validated semantic palette. */
  function handleThemeChange(event: ChangeEvent<HTMLSelectElement>): void {
    theme.setTheme(event.target.value === 'neutral' ? 'neutral' : 'paper');
  }
  /** Applies one validated appearance preference. */
  function handleAppearanceChange(event: ChangeEvent<HTMLSelectElement>): void {
    const value = event.target.value;
    theme.setAppearance(value === 'dark' || value === 'light' ? value : 'system');
  }
  return (
    <div className={styles['theme-controls']}>
      <select value={theme.theme} onChange={handleThemeChange} aria-label="主题">
        <option value={themeOptions[0].id}>{themeOptions[0].label}</option>
        <option value={themeOptions[1].id}>{themeOptions[1].label}</option>
      </select>
      <select value={theme.appearance} onChange={handleAppearanceChange} aria-label="外观">
        <option value={appearanceOptions[0].id}>{appearanceOptions[0].label}</option>
        <option value={appearanceOptions[1].id}>{appearanceOptions[1].label}</option>
        <option value={appearanceOptions[2].id}>{appearanceOptions[2].label}</option>
      </select>
    </div>
  );
}

/** Renders global location, search, creation, status, theme, and context actions. */
function Topbar({ pathname, rightOpen, route, toggleRightPanel }: TopbarProps) {
  return (
    <header className={styles.topbar}>
      <MobileNavigation pathname={pathname} />
      <Link className={styles.brand} href="/">
        Everlearn
      </Link>
      <span className={styles.location}>{route.label}</span>
      <div className={styles['top-actions']}>
        <Link href="/knowledge?search=open">搜索</Link>
        <CreationAction route={route} />
        <Link href={`${route.href}?view=runs`}>运行中 2</Link>
        <div className={styles['desktop-controls']}>
          <ThemeControls />
          <Tooltip content={rightOpen ? '收起上下文' : '展开上下文'}>
            <Button
              aria-controls="context-panel"
              aria-expanded={rightOpen}
              aria-label={rightOpen ? '收起上下文' : '展开上下文'}
              onClick={toggleRightPanel}
              size="small"
              variant="ghost"
            >
              ◫
            </Button>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}

/** Arranges the current page between persistent navigation and contextual information. */
function WorkspacePanels(props: WorkspacePanelsProps) {
  const { children, leftCollapsed, pathname, route, toggleLeftPanel } = props;
  return (
    <div className={styles.workspace}>
      <aside className={styles['left-panel']} aria-label="工作区导航">
        <Button
          aria-controls="primary-navigation"
          aria-expanded={!leftCollapsed}
          onClick={toggleLeftPanel}
          size="small"
          variant="ghost"
        >
          {leftCollapsed ? '展开' : '收起'}
        </Button>
        <div id="primary-navigation">
          <PrimaryNavigation collapsed={leftCollapsed} pathname={pathname} />
        </div>
      </aside>
      <main className={styles.main} id="main-content">
        {children}
      </main>
      <aside className={styles['right-panel']} id="context-panel" aria-label="当前上下文">
        <p className={styles['context-label']}>当前上下文</p>
        <h2>{route.label}</h2>
        <p>{route.context}</p>
      </aside>
    </div>
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
    <TooltipProvider delayDuration={200}>
      <a className={styles['skip-link']} href="#main-content">
        跳到主要内容
      </a>
      <div className={styles.shell} data-left-collapsed={leftCollapsed} data-right-open={rightOpen}>
        <Topbar
          pathname={pathname}
          rightOpen={rightOpen}
          route={route}
          toggleRightPanel={toggleRightPanel}
        />
        <WorkspacePanels
          leftCollapsed={leftCollapsed}
          pathname={pathname}
          route={route}
          toggleLeftPanel={toggleLeftPanel}
        >
          {children}
        </WorkspacePanels>
      </div>
    </TooltipProvider>
  );
}
