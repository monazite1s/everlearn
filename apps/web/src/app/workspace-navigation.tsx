/** @fileoverview Renders Mantine workspace navigation and route-aware mobile creation controls. */

'use client';

import { Burger, Button, Drawer, Modal, NavLink, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import Link from 'next/link';
import {
  GraduationCapIcon,
  HomeIcon,
  LibraryBigIcon,
  PlusIcon,
  RssIcon,
  SettingsIcon,
  WorkflowIcon,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import styles from './app-shell.module.css';
import { getMobileRoutePolicy, isWorkspaceRouteCurrent, workspaceRoutes } from './workspace-routes';
import type { WorkspaceRoute, WorkspaceRouteId } from './workspace-routes';

interface PrimaryNavigationProps {
  collapsed: boolean;
  navigationId: string;
  onNavigate?: () => void;
  pathname: string;
}

const routeIcons: Readonly<Record<WorkspaceRouteId, LucideIcon>> = {
  home: HomeIcon,
  knowledge: LibraryBigIcon,
  news: RssIcon,
  settings: SettingsIcon,
  tutorials: GraduationCapIcon,
  workflows: WorkflowIcon,
};

/** Renders stable primary destinations with icons and a visible current-page state. */
export function PrimaryNavigation(props: PrimaryNavigationProps) {
  const { collapsed, navigationId, onNavigate, pathname } = props;
  /** Renders one destination using Mantine interaction and the knowledge-spine marker. */
  function renderRoute(route: WorkspaceRoute) {
    const current = isWorkspaceRouteCurrent(pathname, route);
    const RouteIcon = routeIcons[route.id];
    const link = (
      <NavLink
        active={current}
        aria-current={current ? 'page' : undefined}
        aria-label={route.label}
        className={styles['nav-link']}
        component={Link}
        href={route.href}
        label={collapsed ? undefined : route.label}
        leftSection={<RouteIcon aria-hidden="true" size={20} strokeWidth={1.7} />}
        variant="subtle"
        {...(onNavigate ? { onClick: onNavigate } : {})}
      />
    );
    if (!collapsed) return <div key={route.id}>{link}</div>;
    return (
      <Tooltip key={route.id} label={route.label} position="right">
        {link}
      </Tooltip>
    );
  }
  return (
    <nav aria-label="一级导航" className={styles.navigation} id={navigationId}>
      {workspaceRoutes.map(renderRoute)}
    </nav>
  );
}

/** Renders primary navigation as a mobile drawer with focus restoration. */
export function MobileNavigation({ pathname }: Pick<PrimaryNavigationProps, 'pathname'>) {
  const [opened, { close, toggle }] = useDisclosure(false);
  return (
    <div className={styles['mobile-navigation']}>
      <Burger aria-label="打开导航" onClick={toggle} opened={opened} size="sm" />
      <Drawer
        classNames={{ content: styles['mobile-drawer'] }}
        closeButtonProps={{ 'aria-label': '关闭导航' }}
        onClose={close}
        opened={opened}
        position="left"
        size="20rem"
        title="导航"
      >
        <PrimaryNavigation
          collapsed={false}
          navigationId="mobile-primary-navigation"
          onNavigate={close}
          pathname={pathname}
        />
      </Drawer>
    </div>
  );
}

/** Replaces mobile creation with the restriction declared by the current route. */
export function CreationAction({ route }: { route: WorkspaceRoute }) {
  const [opened, { close, open }] = useDisclosure(false);
  const mobilePolicy = getMobileRoutePolicy(route);
  return (
    <>
      <Button
        className={styles['desktop-creation']}
        component={Link}
        href="/knowledge?create=document"
        leftSection={<PlusIcon aria-hidden="true" size={18} />}
      >
        新建
      </Button>
      <Button className={styles['mobile-creation']} onClick={open}>
        新建
      </Button>
      <Modal
        closeButtonProps={{ 'aria-label': '关闭创作说明' }}
        onClose={close}
        opened={opened}
        title="请在桌面端创作"
      >
        <Text className={styles['creation-description']}>{mobilePolicy.creationDescription}</Text>
        <Button onClick={close}>返回阅读</Button>
      </Modal>
    </>
  );
}
