/** @fileoverview Renders primary workspace navigation and route-aware mobile creation controls. */

'use client';

import { Button, Dialog, DialogClose, DialogContent, DialogTrigger } from '@everlearn/ui';
import Link from 'next/link';

import styles from './app-shell.module.css';
import { getMobileRoutePolicy, isWorkspaceRouteCurrent, workspaceRoutes } from './workspace-routes';
import type { WorkspaceRoute } from './workspace-routes';

interface PrimaryNavigationProps {
  collapsed: boolean;
  dismissOnNavigate?: boolean;
  pathname: string;
}

/** Renders the stable primary destinations with a visible current-page state. */
export function PrimaryNavigation({
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

/** Renders primary navigation as a mobile modal drawer with managed focus. */
export function MobileNavigation({ pathname }: Pick<PrimaryNavigationProps, 'pathname'>) {
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

/** Replaces mobile creation with the restriction declared by the current route. */
export function CreationAction({ route }: { route: WorkspaceRoute }) {
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
