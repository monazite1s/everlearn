/** @fileoverview Defines the stable workspace routes shared by navigation and page rendering. */

export type WorkspaceRouteId =
  'home' | 'knowledge' | 'news' | 'tutorials' | 'workflows' | 'settings';

export type MobileRouteCapability = 'read' | 'status' | 'limited';

export interface WorkspaceRoute {
  context: string;
  description: string;
  href: string;
  id: WorkspaceRouteId;
  label: string;
  mobileCapability: MobileRouteCapability;
}

export interface MobileRoutePolicy {
  creationDescription: string;
}

const mobileRoutePolicies: Readonly<Record<MobileRouteCapability, MobileRoutePolicy>> = {
  limited: { creationDescription: '移动端只提供基础查看，完整配置请使用桌面端。' },
  read: { creationDescription: '移动端保留阅读、搜索和运行状态，暂不提供内容创作。' },
  status: { creationDescription: '移动端可查看内容与运行状态，暂不提供新建和配置。' },
};

export const homeRoute: WorkspaceRoute = {
  context: '继续最近学习，并查看跨模块运行状态。',
  description: '从最近文档继续学习，进入知识库或快速记录。',
  href: '/',
  id: 'home',
  label: '首页',
  mobileCapability: 'read',
};

export const workspaceRoutes: readonly WorkspaceRoute[] = [
  homeRoute,
  {
    context: '浏览知识库、文档树、Inbox 与回收站。',
    description: '管理知识库、嵌套文档与个人学习资料。',
    href: '/knowledge',
    id: 'knowledge',
    label: '知识库',
    mobileCapability: 'read',
  },
  {
    context: '查看订阅、简报计划和采集运行。',
    description: '订阅重要来源并沉淀每日或每周资讯简报。',
    href: '/news',
    id: 'news',
    label: '资讯',
    mobileCapability: 'status',
  },
  {
    context: '创建教程并跟踪研究、大纲与章节进度。',
    description: '围绕知识点研究、确认大纲并生成系统教程。',
    href: '/tutorials',
    id: 'tutorials',
    label: '教程',
    mobileCapability: 'status',
  },
  {
    context: '管理 Workflow 定义、版本、计划与运行。',
    description: '组合受控步骤，发布并观察可恢复的自动化流程。',
    href: '/workflows',
    id: 'workflows',
    label: '工作流',
    mobileCapability: 'status',
  },
  {
    context: '配置外观、Provider、时区、存储与诊断。',
    description: '管理本地学习终端的外观与服务连接。',
    href: '/settings',
    id: 'settings',
    label: '设置',
    mobileCapability: 'limited',
  },
];

/** Resolves one approved workspace route without accepting arbitrary path segments. */
export function findWorkspaceRoute(id: string): WorkspaceRoute | undefined {
  for (const route of workspaceRoutes) {
    if (route.id === id) return route;
  }
  return undefined;
}

/** Resolves the current top-level location from an application pathname. */
export function getWorkspaceRoute(pathname: string): WorkspaceRoute {
  const id = pathname.split('/')[1] ?? 'home';
  return findWorkspaceRoute(id) ?? homeRoute;
}

/** Tests whether a pathname belongs to one primary workspace destination. */
export function isWorkspaceRouteCurrent(pathname: string, route: WorkspaceRoute): boolean {
  if (route.href === '/') return pathname === '/';
  return pathname === route.href || pathname.startsWith(`${route.href}/`);
}

/** Returns the mobile interaction policy declared by a workspace route. */
export function getMobileRoutePolicy(route: WorkspaceRoute): MobileRoutePolicy {
  return mobileRoutePolicies[route.mobileCapability];
}
