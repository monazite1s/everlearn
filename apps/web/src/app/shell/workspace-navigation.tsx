/** @fileoverview 渲染 Mantine 工作区导航和路由感知的移动端创建控件。 */

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

/** 用于渲染带图标和明确当前态的一级入口。 */
export function PrimaryNavigation(props: PrimaryNavigationProps) {
  const { collapsed, navigationId, onNavigate, pathname } = props;
  /** 用于以 Mantine 交互和知识脊线渲染单个入口。 */
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

/** 用于将一级导航渲染为支持焦点恢复的移动抽屉。 */
export function MobileNavigation({ pathname }: Pick<PrimaryNavigationProps, 'pathname'>) {
  const [opened, { close, toggle }] = useDisclosure(false);
  return (
    <div className={styles['mobile-navigation']}>
      <Burger aria-label="打开导航" onClick={toggle} opened={opened} size="md" />
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

/** 用于在移动端展示当前路由声明的创建限制。 */
export function CreationAction({ route }: { route: WorkspaceRoute }) {
  const [opened, { close, open }] = useDisclosure(false);
  const mobilePolicy = getMobileRoutePolicy(route);
  const creationHref = '/knowledge?create=knowledge-base';
  return (
    <>
      <Button
        className={styles['desktop-creation']}
        component={Link}
        href={creationHref}
        leftSection={<PlusIcon aria-hidden="true" size={18} />}
      >
        新建
      </Button>
      {route.id !== 'knowledge' && (
        <Button className={styles['mobile-creation']} onClick={open}>
          新建
        </Button>
      )}
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
