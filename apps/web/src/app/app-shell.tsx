/** @fileoverview Provides the persistent desktop workspace shell and navigation behavior. */

'use client';

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Tooltip,
  TooltipProvider,
} from '@everlearn/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';

import styles from './app-shell.module.css';
import { appearanceOptions, themeOptions, useTheme } from './theme-provider';
import {
  getMobileRoutePolicy,
  getWorkspaceRoute,
  isWorkspaceRouteCurrent,
  workspaceRoutes,
} from './workspace-routes';
import type { WorkspaceRoute } from './workspace-routes';

interface AppShellProps {
  children: ReactNode;
}

interface PrimaryNavigationProps {
  collapsed: boolean;
  dismissOnNavigate?: boolean;
  pathname: string;
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

const LEFT_PANEL_KEY = 'everlearn-left-panel-collapsed';

/** Focuses the new page title after a client-side route transition. */
function usePageTitleFocus(pathname: string): void {
  useEffect(
    /** Moves keyboard and screen-reader context to the unique page heading. */
    function focusPageTitle(): void {
      document.querySelector<HTMLElement>('[data-page-title]')?.focus();
    },
    [pathname],
  );
}

/** Restores the device-local left panel preference after hydration. */
function usePersistedLeftPanel(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(
    /** Defers browser persistence until after the hydrated frame is stable. */
    function scheduleLeftPanelLoad(): () => void {
      /** Loads a valid local panel preference without blocking hydration. */
      function loadLeftPanel(): void {
        setCollapsed(localStorage.getItem(LEFT_PANEL_KEY) === 'true');
      }
      const timer = window.setTimeout(loadLeftPanel, 0);
      /** Cancels stale persistence work if the shell unmounts immediately. */
      function cancelLeftPanelLoad(): void {
        window.clearTimeout(timer);
      }
      return cancelLeftPanelLoad;
    },
    [],
  );

  /** Toggles and persists the left panel for this browser. */
  function toggleLeftPanel(): void {
    setCollapsed(
      /** Persists the next state derived from the current panel state. */
      function persistNextState(current): boolean {
        const next = !current;
        localStorage.setItem(LEFT_PANEL_KEY, String(next));
        return next;
      },
    );
  }
  return [collapsed, toggleLeftPanel];
}

/** Tracks the right context panel per route for the current browser session. */
function useRouteContextPanel(pathname: string): [boolean, () => void] {
  const [open, setOpen] = useState(true);
  useEffect(
    /** Defers route restoration until after the hydrated frame is stable. */
    function scheduleRightPanelLoad(): () => void {
      /** Restores the saved choice or applies the documented desktop default. */
      function loadRightPanel(): void {
        const stored = sessionStorage.getItem(`everlearn-right-panel:${pathname}`);
        const desktop =
          typeof window.matchMedia === 'function'
            ? window.matchMedia('(width > 1280px)').matches
            : window.innerWidth > 1280;
        setOpen(stored === null ? desktop : stored === 'true');
      }
      const timer = window.setTimeout(loadRightPanel, 0);
      /** Cancels stale route restoration when navigation changes quickly. */
      function cancelRightPanelLoad(): void {
        window.clearTimeout(timer);
      }
      return cancelRightPanelLoad;
    },
    [pathname],
  );

  /** Toggles the current route context without leaking its state to other pages. */
  function toggleRightPanel(): void {
    setOpen(
      /** Persists the next route-specific context state. */
      function persistNextState(current): boolean {
        const next = !current;
        sessionStorage.setItem(`everlearn-right-panel:${pathname}`, String(next));
        return next;
      },
    );
  }
  return [open, toggleRightPanel];
}

/** Renders the six stable primary destinations with visible current-page state. */
function PrimaryNavigation({
  collapsed,
  dismissOnNavigate = false,
  pathname,
}: PrimaryNavigationProps) {
  /** Renders one route using text, aria-current, and the knowledge-spine marker. */
  function renderRoute(route: WorkspaceRoute) {
    const current = isWorkspaceRouteCurrent(pathname, route);
    const link = (
      <Link
        className={styles['nav-link']}
        href={route.href}
        aria-current={current ? 'page' : undefined}
      >
        <span className={styles['short-label']} aria-hidden="true">
          {route.shortLabel}
        </span>
        <span className={collapsed ? styles['visually-hidden'] : undefined}>{route.label}</span>
      </Link>
    );
    return (
      <li key={route.id}>{dismissOnNavigate ? <DialogClose asChild>{link}</DialogClose> : link}</li>
    );
  }
  return (
    <nav aria-label="一级导航">
      <ul className={styles.navigation}>{workspaceRoutes.map(renderRoute)}</ul>
    </nav>
  );
}

/** Renders the mobile navigation as a modal drawer with managed focus. */
function MobileNavigation({ pathname }: Pick<PrimaryNavigationProps, 'pathname'>) {
  return (
    <div className={styles['mobile-navigation']}>
      <Dialog>
        <DialogTrigger asChild>
          <Button aria-label="打开导航" size="small" variant="ghost">
            菜单
          </Button>
        </DialogTrigger>
        <DialogContent className={styles['mobile-drawer']} heading="导航">
          <PrimaryNavigation collapsed={false} dismissOnNavigate pathname={pathname} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Replaces mobile creation with an explicit desktop requirement. */
function CreationAction({ route }: Pick<TopbarProps, 'route'>) {
  const mobilePolicy = getMobileRoutePolicy(route);
  return (
    <>
      <Link
        className={`${styles['primary-action']} ${styles['desktop-creation']}`}
        href="/knowledge?create=document"
      >
        新建
      </Link>
      <div className={styles['mobile-creation']}>
        <Dialog>
          <DialogTrigger asChild>
            <Button size="small">新建</Button>
          </DialogTrigger>
          <DialogContent description={mobilePolicy.creationDescription} heading="请在桌面端创作">
            <DialogClose asChild>
              <Button>返回阅读</Button>
            </DialogClose>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
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
